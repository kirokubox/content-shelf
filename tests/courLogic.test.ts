import { test } from "node:test";
import assert from "node:assert/strict";
import { addCour, canAddCurrentRerun, currentCourList, currentCourName, currentRerun, defaultVia, formatCour, latestViaMap, parseSeasonLabel, seasonOfMonth, subLabel, viaPlaceParts } from "../src/courLogic.js";
import { continueGroup, isTsundoku, roundsLabel, startAgain } from "../src/progressLogic.js";
import { applyAnilist, courOf, workStateOf } from "../src/anilist.js";
import type { AnilistMedia } from "../src/anilist.js";
import { statusWord, workStateChoices, workStateWord, PURCHASE_STAGE_LABEL, LOG_VIA_LABEL } from "../src/constants.js";
import { buildMarkdown } from "../src/markdownExport.js";
import { searchMine } from "../src/searchLogic.js";
import { emptyWork, newLog } from "../src/workFactory.js";
import type { Cour } from "../src/types.js";

const NOW = "2026-11-18T03:00:00.000Z";
const TODAY = "2026-11-18";
const FALL: Cour = { year: 2026, season: "fall", kind: "original" };

test("季節は1〜3月＝冬、4〜6月＝春、7〜9月＝夏、10〜12月＝秋。表示と今期の名前", () => {
  assert.deepEqual([1, 3, 4, 6, 7, 9, 10, 12].map(seasonOfMonth), ["winter", "winter", "spring", "spring", "summer", "summer", "fall", "fall"]);
  assert.equal(formatCour({ year: 2025, season: "summer", kind: "original" }), "2025年夏");
  assert.equal(formatCour({ ...FALL, kind: "rerun" }), "再放送 2026年秋");
  assert.equal(currentCourName(TODAY), "2026年秋");
  assert.deepEqual(parseSeasonLabel("2026年秋"), FALL);
  assert.equal(parseSeasonLabel("2026年秋クール"), null);
  assert.equal(parseSeasonLabel("第2期"), null);
});

test("今期の再放送：足せるのは同じものが無いときだけ。クールは重ねない", () => {
  const w = { ...emptyWork("anime", NOW), cours: [FALL] };
  assert.equal(canAddCurrentRerun(w, TODAY), true);
  const cours = addCour(w.cours, currentRerun(TODAY));
  assert.equal(cours.length, 2);
  assert.equal(canAddCurrentRerun({ cours }, TODAY), false);
  assert.equal(addCour(cours, currentRerun(TODAY)).length, 2);
});

test("題名の横の表示：期・編・巻とクール（アニメ・ドラマだけ）。検索は両方で引ける", () => {
  const a = { ...emptyWork("anime", NOW), title: "架空アニメ", partLabel: "第2期", cours: [FALL] };
  assert.equal(subLabel(a), "第2期　2026年秋");
  assert.equal(subLabel({ ...emptyWork("novel", NOW), partLabel: "上", cours: [FALL] }), "上");
  const data = { franchises: [], people: [], logs: [], works: [a] };
  assert.equal(searchMine(data, "第2期").length, 1);
  assert.equal(searchMine(data, "2026年秋").length, 1);
  assert.equal(searchMine(data, "2026秋").length, 1);
});

test("記録の視聴手段の既定：前回の記録 → 種類ごと（今期が再放送なら再放送）", () => {
  const anime = { ...emptyWork("anime", NOW), id: "a" };
  assert.equal(defaultVia(anime, [], TODAY), "broadcast");
  assert.equal(defaultVia({ ...anime, cours: [currentRerun(TODAY)] }, [], TODAY), "rerun");
  assert.equal(defaultVia({ ...anime, cours: [FALL, currentRerun(TODAY)] }, [], TODAY), "broadcast");
  assert.equal(defaultVia({ ...emptyWork("movie", NOW), id: "m" }, [], TODAY), "venue");
  assert.equal(defaultVia({ ...emptyWork("live", NOW), id: "l" }, [], TODAY), "venue");
  assert.equal(defaultVia({ ...emptyWork("video", NOW), id: "v" }, [], TODAY), "disc");
  assert.equal(defaultVia({ ...emptyWork("manga", NOW), id: "g" }, [], TODAY), null);
  const logs = [
    newLog({ workId: "a", kind: "progress", date: "2026-11-01", via: "streaming" }, NOW),
    newLog({ workId: "a", kind: "progress", date: "2026-11-08", via: "recording" }, NOW),
  ];
  assert.equal(defaultVia(anime, logs, TODAY), "recording");
  assert.equal(viaPlaceParts({ via: "streaming", place: "配信" }).length, 1);
  assert.deepEqual(viaPlaceParts({ via: "broadcast", place: "テレビ" }), ["放送", "テレビ"]);
});

test("今期の一覧：配信の作品は外し、記録が無ければ放送として出す。済は別に分ける", () => {
  const mk = (id: string, patch: object = {}) => ({ ...emptyWork("anime", NOW), id, title: id, cours: [FALL], ...patch });
  const works = [mk("onair"), mk("stream"), mk("done", { status: "done" }), mk("wish", { status: "wish" }), mk("paused", { status: "paused" }), mk("other", { cours: [{ ...FALL, year: 2025 }] }), mk("rerun", { cours: [{ ...FALL, kind: "rerun" }] })];
  const logs = [
    newLog({ workId: "stream", kind: "progress", date: "2026-11-10", via: "streaming" }, NOW),
    newLog({ workId: "onair", kind: "progress", date: "2026-11-10", via: "broadcast" }, NOW),
    newLog({ workId: "onair", kind: "progress", date: "2026-11-01", via: "streaming" }, NOW),
  ];
  const r = currentCourList(works, logs, TODAY);
  assert.deepEqual(r.active.map((c) => c.work.id).sort(), ["onair", "rerun", "wish"]);
  assert.equal(r.active.find((c) => c.work.id === "rerun")!.rerun, true);
  assert.equal(r.active.find((c) => c.work.id === "onair")!.rerun, false);
  assert.deepEqual(r.done.map((c) => c.work.id), ["done"]);
  assert.equal(latestViaMap(logs).get("onair"), "broadcast");
});

test("現在：放送予定、または放送中＋今期のクール＋最新の記録が配信でない。途中＝それ以外の進行中", () => {
  const base = { ...emptyWork("anime", NOW), title: "a", status: "active" as const };
  const ctx = { today: TODAY, latestVia: null };
  assert.equal(continueGroup({ ...base, workState: "ongoing", cours: [FALL] }, ctx), "current");
  assert.equal(continueGroup({ ...base, workState: "ongoing", cours: [FALL] }, { ...ctx, latestVia: "streaming" }), "partway");
  assert.equal(continueGroup({ ...base, workState: "finished", cours: [FALL] }, ctx), "partway");
  assert.equal(continueGroup({ ...base, workState: "ongoing", cours: [] }, ctx), "partway");
  assert.equal(continueGroup({ ...base, workState: "ongoing", cours: [{ ...FALL, year: 2025 }] }, ctx), "partway");
  // 放送予定が入っていれば、最新の記録が配信でも追っている
  const schedule = { firstDate: "2026-10-05", firstNumber: 1, skipDates: [] };
  assert.equal(continueGroup({ ...base, schedule, cours: [] }, { ...ctx, latestVia: "streaming" }), "current");
  assert.equal(continueGroup({ ...base, workState: "ongoing", cours: [FALL], status: "wish" }, ctx), "planned");
});

test("積読・○周目・もう一度見ると周回数が増える", () => {
  const w = { ...emptyWork("manga", NOW), status: "wish" as const };
  assert.equal(isTsundoku({ ...w, purchase: { stage: "owned", format: "paper", store: null } }), true);
  assert.equal(isTsundoku({ ...w, purchase: { stage: "planned", format: null, store: null } }), false);
  assert.equal(isTsundoku({ ...w, status: "active", purchase: { stage: "owned", format: null, store: null } }), false);
  assert.equal(roundsLabel({ rounds: 1 }), "");
  assert.equal(roundsLabel({ rounds: 3 }), "3周目");
  const again = startAgain({ ...w, status: "done", rounds: 1, progress: 10 }, NOW);
  assert.equal(again.rounds, 2);
  assert.equal(again.progress, null);
});

test("AniList：時期は本放送のクール、始まる前は「始まる前」。すでに本放送のクールがあれば足さない", () => {
  const m: AnilistMedia = { id: 1, type: "ANIME", title: "架空", romaji: "", status: "NOT_YET_RELEASED", format: "TV", episodes: 12, volumes: null, cover: null, nextEpisode: null, season: "FALL", seasonYear: 2026, startDate: null };
  assert.deepEqual(courOf(m), FALL);
  assert.equal(courOf({ ...m, type: "MANGA" }), null);
  const w = applyAnilist({ ...emptyWork("anime", NOW), title: "a" }, m, NOW);
  assert.equal(w.workState, "upcoming");
  assert.deepEqual(w.cours, [FALL]);
  const again = applyAnilist(w, { ...m, status: "RELEASING", nextEpisode: 3 }, NOW);
  assert.equal(again.workState, "ongoing");
  assert.equal(again.cours.length, 1);
  assert.equal(workStateOf({ ...m, status: "CANCELLED" }, "ongoing"), "ongoing");
  assert.equal(applyAnilist({ ...w, cours: [{ year: 2025, season: "spring", kind: "original" }] }, m, NOW).cours.length, 1);
});

test("表示名は名詞：状態・購入・視聴手段", () => {
  assert.deepEqual(workStateChoices("anime").map((s) => workStateWord("anime", s)), ["放送前", "放送中", "完結", "不明"]);
  assert.deepEqual(workStateChoices("manga").map((s) => workStateWord("manga", s)), ["連載前", "連載中", "完結", "不明"]);
  assert.deepEqual(workStateChoices("novel").map((s) => workStateWord("novel", s)), ["発売前", "発売済", "不明"]);
  assert.deepEqual(workStateChoices("movie").map((s) => workStateWord("movie", s)), ["公開前", "公開済", "不明"]);
  assert.deepEqual(workStateChoices("live").map((s) => workStateWord("live", s)), ["開催前", "開催済", "不明"]);
  // v0.17.0 で購入の段階の名前を 持ってない／買う予定／予約済み／持ってる に変えた
  assert.deepEqual(Object.values(PURCHASE_STAGE_LABEL), ["持ってない", "買う予定", "予約済み", "持ってる"]);
  assert.deepEqual(Object.values(LOG_VIA_LABEL), ["放送", "再放送", "配信", "円盤", "録画", "劇場・会場"]);
  assert.equal(statusWord("manga", "wish"), "読書予定");
});

test("書き出し：作品の状態・クール・周回数・購入・視聴手段が出る", () => {
  const w = { ...emptyWork("anime", NOW), id: "a", title: "架空アニメ", partLabel: "第2期", cours: [FALL, currentRerun(TODAY)], workState: "finished" as const, rounds: 2, status: "done" as const, purchase: { stage: "owned" as const, format: "bluray" as const, store: null }, progress: 12 };
  const l = newLog({ workId: "a", kind: "progress", date: "2026-10-05", position: 3, place: "テレビ", via: "broadcast" }, NOW);
  const md = buildMarkdown({ franchises: [], people: [], works: [w], logs: [l] }, NOW);
  assert.ok(md.includes("- 架空アニメ 第2期 2026年秋・再放送 2026年秋｜視聴済｜作品：完結｜2周目｜購入：持ってる（Blu-ray）｜第12話まで"), md);
  assert.ok(md.includes("  - 2026-10-05　第3話　放送　テレビ"), md);
});
