import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyCounts, periodRange, summarize } from "../src/summaryLogic.js";
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
  const data = { franchises: [], people: [], works: [movie, anime], logs };
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
  assert.equal(summarize({ franchises: [], people: [], works: [movie], logs: [log] }, "all", "2026-10-31").length, 0);
});

test("週は月曜から日曜で、年だけの記録は数えない", () => {
  const novel = { ...emptyWork("novel", NOW), title: "小説" };
  const logs = [
    newLog({ workId: novel.id, kind: "view", date: "2026-11-09" }, NOW),
    newLog({ workId: novel.id, kind: "view", date: "2026-11-15" }, NOW),
    newLog({ workId: novel.id, kind: "view", date: "2026-11-16" }, NOW),
    { ...newLog({ workId: novel.id, kind: "view", date: "2026-01-01" }, NOW), datePrecision: "year" as const },
    { ...newLog({ workId: novel.id, kind: "view", date: "2026-11-01" }, NOW), datePrecision: "month" as const },
  ];
  const data = { franchises: [], people: [], works: [novel], logs };
  assert.deepEqual(periodRange("week", "2026-11-12"), { from: "2026-11-09", to: "2026-11-15" });
  assert.deepEqual(summarize(data, "week", "2026-11-12"), [{ medium: "novel", works: 1, count: 2 }]);
});
