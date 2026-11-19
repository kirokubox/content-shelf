import { test } from "node:test";
import assert from "node:assert/strict";
import { addCurrentRerun, continueGroup, hasNext, isStopped, isWaitingForNewVolume, startAgain } from "../src/progressLogic.js";
import { emptyWork } from "../src/workFactory.js";
import { statusWord, workStatusWord } from "../src/constants.js";

const NOW = "2026-11-01T03:00:00.000Z";
const TODAY = "2026-11-19";
const FALL = { year: 2026, season: "fall" as const, kind: "original" as const };
const RERUN = { year: 2026, season: "fall" as const, kind: "rerun" as const };

const WEEKLY = { firstDate: "2026-10-05", firstNumber: 1, skipDates: [] };
const ctx = { today: TODAY, latestVia: null };

test("現在＝放送予定のあるアニメ・週刊誌・連載中で続きの巻も買うマンガ・プレイ中のゲーム。途中＝印のない進行中のマンガ", () => {
  assert.equal(continueGroup({ ...emptyWork("anime", NOW), title: "a", schedule: WEEKLY }), "current");
  assert.equal(continueGroup({ ...emptyWork("magazine", NOW), title: "a" }), "current");
  assert.equal(continueGroup({ ...emptyWork("manga", NOW), title: "a", buying: true, workState: "ongoing" }), "current");
  assert.equal(continueGroup({ ...emptyWork("game", NOW), title: "g", status: "active" }), "current");
  assert.equal(continueGroup({ ...emptyWork("manga", NOW), title: "a" }), "partway");
  assert.equal(continueGroup({ ...emptyWork("movie", NOW), title: "a", status: "active" }), "partway");
});

test("完結したマンガは、続きの巻を買う印がついていても途中", () => {
  const m = { ...emptyWork("manga", NOW), title: "m", buying: true, workState: "finished" as const, total: 20, progress: 3 };
  assert.equal(continueGroup(m), "partway");
  assert.equal(continueGroup({ ...m, workState: "ongoing" }), "current");
});

test("購入だけを理由に続きタブへ出さない：済・予定のマンガは未購入の巻があっても元の区分", () => {
  const base = {
    ...emptyWork("manga", NOW), title: "m", buying: true, latestKnown: 3, workState: "ongoing" as const,
    owned: { known: true, ranges: [{ from: 1, to: 2 }], reserved: [], volumeDates: [], place: null },
  };
  assert.equal(continueGroup({ ...base, status: "done" }), null);
  assert.equal(continueGroup({ ...base, status: "wish" }), "planned");
  assert.equal(continueGroup({ ...base, status: "paused" }), "partway");
});

test("中断は途中に入り、一番下にたたむ印（isStopped）が立つ。予定は予定", () => {
  const paused = { ...emptyWork("anime", NOW), title: "a", schedule: WEEKLY, status: "paused" as const };
  assert.equal(continueGroup(paused), "partway");
  assert.equal(isStopped(paused), true);
  assert.equal(isStopped({ ...paused, status: "active" }), false);
  for (const m of ["novel", "movie", "live", "video", "anime"] as const) assert.equal(continueGroup({ ...emptyWork(m, NOW), title: "x", status: "wish" }), "planned");
});

test("追いついた作品は「見るものがない」になり、たたむ側へ。購入は見ない", () => {
  const caught = { ...emptyWork("anime", NOW), title: "a", latestKnown: 5, progress: 5 };
  assert.equal(hasNext(caught, "2026-11-01"), false);
  assert.equal(hasNext({ ...caught, progress: 4 }, "2026-11-01"), true);
  const buying = { ...emptyWork("manga", NOW), title: "m", buying: true, latestKnown: 10, progress: 10, owned: { known: true, ranges: [{ from: 1, to: 9 }], reserved: [], volumeDates: [], place: null } };
  assert.equal(hasNext(buying, "2026-11-01"), false);
});

test("もう一度読む：位置を最初に戻して進行中へ（記録は消さない）", () => {
  const done = { ...emptyWork("manga", NOW), title: "a", status: "done" as const, progress: 20, completedAt: NOW };
  const again = startAgain(done, NOW);
  assert.equal(again.status, "active");
  assert.equal(again.progress, null);
  assert.equal(again.completedAt, null);
  assert.equal(continueGroup(again), "partway");
});

test("アニメ・ドラマは、放送予定か今期のクールが付いた作品だけ現在。どちらも無ければ途中", () => {
  assert.equal(continueGroup({ ...emptyWork("anime", NOW), title: "a" }), "partway");
  assert.equal(continueGroup({ ...emptyWork("anime", NOW), title: "a", latestKnown: 12, progress: 3 }), "partway");
  assert.equal(continueGroup({ ...emptyWork("drama", NOW), title: "d", status: "active" }), "partway");
  assert.equal(continueGroup({ ...emptyWork("drama", NOW), title: "d", status: "active", schedule: WEEKLY }), "current");
  // 放送予定が残っていても、完結した作品は途中
  assert.equal(continueGroup({ ...emptyWork("anime", NOW), title: "a", schedule: WEEKLY, workState: "finished" }), "partway");
});

test("小説は読書中のときだけ途中、予定は予定、読了は出ない", () => {
  assert.equal(continueGroup({ ...emptyWork("novel", NOW), title: "n", status: "active" }), "partway");
  assert.equal(continueGroup({ ...emptyWork("novel", NOW), title: "n", status: "done" }), null);
  assert.equal(continueGroup({ ...emptyWork("novel", NOW), title: "n", status: "wish" }), "planned");
  // 読書中の小説は数える続きを持たないので、「次にやること」には入らない
  assert.equal(hasNext({ ...emptyWork("novel", NOW), title: "n", status: "active" }, "2026-11-01"), false);
});

test("再放送：今期の再放送の印で現在へ。済の作品は2周目から、済でなければ1周目のまま", () => {
  const done = { ...emptyWork("anime", NOW), title: "a", status: "done" as const, workState: "finished" as const, total: 12, progress: 12, completedAt: NOW, cours: [{ year: 2020, season: "spring" as const, kind: "original" as const }] };
  const r = addCurrentRerun(done, TODAY, NOW);
  assert.equal(r.rounds, 2);
  assert.equal(r.progress, null);
  assert.equal(r.status, "active");
  assert.deepEqual(r.cours[r.cours.length - 1], RERUN);
  assert.equal(continueGroup(r, ctx), "current");
  const fresh = addCurrentRerun({ ...done, status: "wish", completedAt: null, progress: null }, TODAY, NOW);
  assert.equal(fresh.rounds, 1);
  assert.equal(fresh.status, "active");
  assert.equal(continueGroup(fresh, ctx), "current");
  // 再放送のクールが終わったら（次の期）、進行中のままなら途中へ
  assert.equal(continueGroup(r, { today: "2027-01-10", latestVia: null }), "partway");
  // 本放送の今期のクール（放送中）も現在。最新の記録が配信なら途中
  const airing = { ...emptyWork("anime", NOW), title: "b", workState: "ongoing" as const, cours: [FALL] };
  assert.equal(continueGroup(airing, ctx), "current");
  assert.equal(continueGroup(airing, { ...ctx, latestVia: "streaming" }), "partway");
});

test("新刊待ち：進行中・未完結のマンガで、読んだ巻が最新巻と同じとき", () => {
  const base = { ...emptyWork("manga", NOW), title: "m", status: "active" as const, latestKnown: 5, progress: 5 };
  const T = "2026-11-18";
  assert.equal(isWaitingForNewVolume(base, T), true);
  assert.equal(isWaitingForNewVolume({ ...base, progress: 4 }, T), false);
  assert.equal(isWaitingForNewVolume({ ...base, workState: "finished", total: 5 }, T), false);
  assert.equal(isWaitingForNewVolume({ ...base, status: "paused" }, T), false);
  assert.equal(isWaitingForNewVolume({ ...base, status: "done" }, T), false);
  assert.equal(isWaitingForNewVolume({ ...base, latestKnown: null, progress: null }, T), false);
  assert.equal(isWaitingForNewVolume({ ...base, medium: "anime" }, T), false);
  // 追いついているのたたみにそのまま入る（やることがない）
  assert.equal(hasNext(base, T), false);
});

test("関係の表示名（予定／進行中／中断／済）", () => {
  const want = {
    anime: ["視聴予定", "視聴中", "視聴済"], drama: ["視聴予定", "視聴中", "視聴済"], movie: ["視聴予定", "視聴中", "視聴済"],
    manga: ["読書予定", "読書中", "読了"], novel: ["読書予定", "読書中", "読了"], magazine: ["読書予定", "読書中", "読了"],
    live: ["参戦予定", "視聴中", "参戦済"], game: ["プレイ予定", "プレイ中", "クリア済"],
  } as const;
  for (const [m, [wish, active, done]] of Object.entries(want)) {
    if (m !== "live") {
      assert.equal(statusWord(m as never, "wish"), wish);
      assert.equal(statusWord(m as never, "done"), done);
    }
    if (m !== "live") assert.equal(statusWord(m as never, "active"), active);
    assert.equal(statusWord(m as never, "paused"), "中断");
  }
  assert.equal(statusWord("live", "wish"), "参戦予定");
  assert.equal(statusWord("live", "done"), "参戦済");
  assert.equal(workStatusWord({ medium: "live", eventKind: "food" }, "wish"), "行く予定");
  assert.equal(workStatusWord({ medium: "live", eventKind: "food" }, "done"), "体験済");
});
