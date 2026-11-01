import { test } from "node:test";
import assert from "node:assert/strict";
import { dateKeyFromInput, formatLogDate, inputFromDateKey } from "../src/dateUtils.js";
import { monthlyCounts, summarize } from "../src/summaryLogic.js";
import { normalizeWork } from "../src/dataOps.js";
import { statusWord } from "../src/constants.js";
import { continueGroup } from "../src/progressLogic.js";
import { emptyWork, newLog } from "../src/workFactory.js";

const NOW = "2026-11-01T03:00:00.000Z";

test("年だけ・年月だけの入力を日付キーにする", () => {
  assert.equal(dateKeyFromInput("2015", "year"), "2015-01-01");
  assert.equal(dateKeyFromInput("２０１５", "year"), "2015-01-01");
  assert.equal(dateKeyFromInput("2015-03", "month"), "2015-03-01");
  assert.equal(dateKeyFromInput("2015-03-10", "day"), "2015-03-10");
  assert.equal(dateKeyFromInput("15", "year"), null);
  assert.equal(inputFromDateKey("2015-03-01", "month"), "2015-03");
});

test("年だけ・年月だけの記録の出し方", () => {
  assert.equal(formatLogDate("2015-01-01", "year", "2026-11-01"), "2015年");
  assert.equal(formatLogDate("2015-03-01", "month", "2026-11-01"), "2015年3月");
  assert.equal(formatLogDate("2026-03-01", "month", "2026-11-01"), "3月");
});

test("年だけの記録は月ごと・今月の集計に入れない", () => {
  const game = { ...emptyWork("game", NOW), title: "ゲーム" };
  const logs = [newLog({ workId: game.id, kind: "view", date: "2026-01-01", datePrecision: "year" }, NOW)];
  const data = { franchises: [], works: [game], logs, people: [] };
  assert.equal(monthlyCounts(data, "2026")[0], 0);
  assert.equal(summarize(data, "month", "2026-01-15").length, 0);
  assert.equal(summarize(data, "year", "2026-01-15")[0].count, 1);
});

test("古い作品に新しい項目を補う・ゲームの状態の名前", () => {
  const { platform, clearLevel, ownFormat, isOriginal, ...old } = emptyWork("novel", NOW);
  void platform; void clearLevel; void ownFormat; void isOriginal;
  const w = normalizeWork(old as never);
  assert.deepEqual([w.platform, w.clearLevel, w.ownFormat, w.isOriginal], ["", null, null, false]);
  assert.equal(statusWord("game", "active"), "プレイ中");
  assert.equal(statusWord("manga", "wish"), "積読");
  assert.equal(statusWord("movie", "done"), "視聴済み");
  assert.equal(continueGroup({ ...emptyWork("game", NOW), status: "active" }), "following");
});
