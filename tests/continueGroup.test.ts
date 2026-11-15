import { test } from "node:test";
import assert from "node:assert/strict";
import { continueGroup, hasNext, startAgain } from "../src/progressLogic.js";
import { emptyWork } from "../src/workFactory.js";

const NOW = "2026-11-01T03:00:00.000Z";

const WEEKLY = { firstDate: "2026-10-05", firstNumber: 1, skipDates: [] };

test("追っている＝放送予定のあるアニメ・週刊誌・新刊を買うマンガ、途中＝印のない進行中のマンガ", () => {
  assert.equal(continueGroup({ ...emptyWork("anime", NOW), title: "a", schedule: WEEKLY }), "following");
  assert.equal(continueGroup({ ...emptyWork("magazine", NOW), title: "a" }), "following");
  assert.equal(continueGroup({ ...emptyWork("manga", NOW), title: "a", buying: true }), "following");
  assert.equal(continueGroup({ ...emptyWork("manga", NOW), title: "a" }), "reading");
  assert.equal(continueGroup({ ...emptyWork("manga", NOW), title: "a", status: "paused" }), null);
  assert.equal(continueGroup({ ...emptyWork("movie", NOW), title: "a", status: "active" }), null);
});

test("未購入があるマンガは状態に関係なく追っているへ出し、買い終わると元の状態どおり外れる", () => {
  const base = {
    ...emptyWork("manga", NOW), title: "m", buying: true, latestKnown: 3,
    owned: { known: true, ranges: [{ from: 1, to: 2 }], medium: null, place: null },
  };
  for (const status of ["done", "wish", "paused"] as const) assert.equal(continueGroup({ ...base, status }), "following");
  assert.equal(continueGroup({ ...base, status: "done", owned: { ...base.owned, ranges: [{ from: 1, to: 3 }] } }), null);
  assert.equal(continueGroup({ ...emptyWork("novel", NOW), status: "done", buying: true, latestKnown: 3 }), null);
});

test("追いついた作品は「やることがない」になり、たたむ側へ", () => {
  const caught = { ...emptyWork("anime", NOW), title: "a", latestKnown: 5, progress: 5 };
  assert.equal(hasNext(caught, "2026-11-01"), false);
  assert.equal(hasNext({ ...caught, progress: 4 }, "2026-11-01"), true);
  const buying = { ...emptyWork("manga", NOW), title: "m", buying: true, latestKnown: 10, progress: 10, owned: { known: true, ranges: [{ from: 1, to: 9 }], medium: null, place: null } };
  assert.equal(hasNext(buying, "2026-11-01"), true);
});

test("もう一度読む：位置を最初に戻して進行中へ（記録は消さない）", () => {
  const done = { ...emptyWork("manga", NOW), title: "a", status: "done" as const, progress: 20, completedAt: NOW };
  const again = startAgain(done, NOW);
  assert.equal(again.status, "active");
  assert.equal(again.progress, null);
  assert.equal(again.completedAt, null);
  assert.equal(continueGroup(again), "reading");
});

test("アニメ・ドラマは、毎週の放送予定を入れた作品だけ追っている。入れていなければ途中", () => {
  assert.equal(continueGroup({ ...emptyWork("anime", NOW), title: "a" }), "reading");
  assert.equal(continueGroup({ ...emptyWork("anime", NOW), title: "a", latestKnown: 12, progress: 3 }), "reading");
  assert.equal(continueGroup({ ...emptyWork("drama", NOW), title: "d", status: "active" }), "reading");
  assert.equal(continueGroup({ ...emptyWork("drama", NOW), title: "d", status: "active", schedule: WEEKLY }), "following");
  assert.equal(continueGroup({ ...emptyWork("anime", NOW), title: "a", schedule: WEEKLY, status: "paused" }), null);
});

test("小説は読書中のときだけ途中に並ぶ。読了・積読・中断は並ばない", () => {
  assert.equal(continueGroup({ ...emptyWork("novel", NOW), title: "n", status: "active" }), "reading");
  for (const status of ["done", "wish", "paused"] as const) assert.equal(continueGroup({ ...emptyWork("novel", NOW), title: "n", status }), null);
  // 読書中の小説は数える続きを持たないので、「次にやること」には入らない
  assert.equal(hasNext({ ...emptyWork("novel", NOW), title: "n", status: "active" }, "2026-11-01"), false);
});
