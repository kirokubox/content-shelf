import { test } from "node:test";
import assert from "node:assert/strict";
import { continueGroup, hasNext, startAgain } from "../src/progressLogic.js";
import { emptyWork } from "../src/workFactory.js";

const NOW = "2026-11-01T03:00:00.000Z";

test("追っている＝アニメ・週刊誌・新刊を買うマンガ、読みかけ＝印のない進行中のマンガ", () => {
  assert.equal(continueGroup({ ...emptyWork("anime", NOW), title: "a" }), "following");
  assert.equal(continueGroup({ ...emptyWork("magazine", NOW), title: "a" }), "following");
  assert.equal(continueGroup({ ...emptyWork("manga", NOW), title: "a", buying: true }), "following");
  assert.equal(continueGroup({ ...emptyWork("manga", NOW), title: "a" }), "reading");
  assert.equal(continueGroup({ ...emptyWork("manga", NOW), title: "a", status: "paused" }), null);
  assert.equal(continueGroup({ ...emptyWork("movie", NOW), title: "a", status: "active" }), null);
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
