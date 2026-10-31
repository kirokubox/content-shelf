import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyCounts, summarize } from "../src/summaryLogic.js";
import { emptyWork, newLog } from "../src/workFactory.js";

const NOW = "2026-10-31T03:00:00.000Z";

test("同じ映画を2回見たら、作品は1・回数は2", () => {
  const movie = { ...emptyWork("movie", NOW), title: "映画" };
  const anime = { ...emptyWork("anime", NOW), title: "アニメ" };
  const logs = [
    newLog({ workId: movie.id, kind: "view", date: "2026-10-03" }, NOW),
    newLog({ workId: movie.id, kind: "view", date: "2026-10-20" }, NOW),
    newLog({ workId: anime.id, kind: "progress", date: "2026-10-20", position: 1 }, NOW),
    newLog({ workId: anime.id, kind: "progress", date: "2026-09-20", position: 2 }, NOW),
  ];
  const data = { franchises: [], works: [movie, anime], logs };
  const month = summarize(data, "month", "2026-10-31");
  assert.deepEqual(month.find((r) => r.medium === "movie"), { medium: "movie", works: 1, count: 2 });
  assert.deepEqual(month.find((r) => r.medium === "anime"), { medium: "anime", works: 1, count: 1 });
  assert.equal(summarize(data, "year", "2026-10-31").find((r) => r.medium === "anime")?.count, 2);
  const months = monthlyCounts(data, "2026");
  assert.equal(months[9], 3);
  assert.equal(months[8], 1);
});

test("削除した記録・作品は数えない", () => {
  const movie = { ...emptyWork("movie", NOW), title: "映画" };
  const log = { ...newLog({ workId: movie.id, kind: "view", date: "2026-10-03" }, NOW), deletedAt: NOW };
  assert.equal(summarize({ franchises: [], works: [movie], logs: [log] }, "all", "2026-10-31").length, 0);
});
