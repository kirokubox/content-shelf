import { test } from "node:test";
import assert from "node:assert/strict";
import { exportRange, isoWeek, logInRange, weekStart } from "../src/exportRange.js";
import { buildMarkdown } from "../src/markdownExport.js";
import { emptyWork, newLog } from "../src/workFactory.js";

const NOW = "2026-11-01T03:00:00.000Z";

test("週は月曜はじまり・ISO週の番号", () => {
  assert.equal(weekStart("2026-11-01"), "2026-10-26"); // 日曜
  assert.equal(weekStart("2026-10-26"), "2026-10-26"); // 月曜
  assert.deepEqual(isoWeek("2026-09-21"), { year: 2026, week: 39 });
  assert.deepEqual(isoWeek("2026-12-31"), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek("2027-01-01"), { year: 2026, week: 53 });
});

test("今週・先週・今月・先月の期間", () => {
  const w = exportRange("week", "2026-11-01", 0);
  assert.deepEqual([w.from, w.to, w.key, w.label], ["2026-10-26", "2026-11-01", "2026-W44", "2026年W44（10/26〜11/1）"]);
  assert.equal(exportRange("week", "2026-11-01", -1).from, "2026-10-19");
  const m = exportRange("month", "2026-11-01", -1);
  assert.deepEqual([m.from, m.to, m.key, m.label], ["2026-10-01", "2026-10-31", "2026-10", "2026年10月"]);
  assert.equal(exportRange("month", "2026-03-15", -1).to, "2026-02-28");
  assert.equal(exportRange("month", "2026-01-10", -1).key, "2025-12");
});

test("年月だけの記録は月には入るが、週には入らない", () => {
  const week = { from: "2026-09-28", to: "2026-10-04" };
  const month = { from: "2026-10-01", to: "2026-10-31" };
  assert.equal(logInRange("2026-10-01", "month", week), false);
  assert.equal(logInRange("2026-10-01", "month", month), true);
  assert.equal(logInRange("2026-01-01", "year", month), false);
  assert.equal(logInRange("2026-10-03", "day", week), true);
});

test("期間の書き出しには期間内の記録だけが入る", () => {
  const a = { ...emptyWork("movie", NOW), title: "見本の映画A" };
  const b = { ...emptyWork("movie", NOW), title: "見本の映画B" };
  const logs = [
    newLog({ workId: a.id, kind: "view", date: "2026-10-27" }, NOW),
    newLog({ workId: b.id, kind: "view", date: "2026-10-10" }, NOW),
  ];
  const data = { franchises: [], works: [a, b], logs, people: [] };
  const r = exportRange("week", "2026-11-01", 0);
  const text = buildMarkdown(data, NOW, r);
  assert.ok(text.includes("見本の映画A"));
  assert.ok(!text.includes("見本の映画B"));
  assert.ok(text.includes("2026年W44"));
});
