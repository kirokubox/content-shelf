import { test } from "node:test";
import assert from "node:assert/strict";
import { availableCount, isFullyConsumed, stepForward, unconsumedCount, unreadIssues, weeklyDates } from "../src/progressLogic.js";
import { emptyWork } from "../src/workFactory.js";
import type { Work } from "../src/types.js";

const NOW = "2026-10-31T03:00:00.000Z";

function anime(patch: Partial<Work> = {}): Work {
  return { ...emptyWork("anime", NOW), title: "テスト", ...patch };
}

test("毎週の日付は休みを飛ばし、今日までを数える", () => {
  const s = { firstDate: "2026-10-04", firstNumber: 1, skipDates: ["2026-10-18"] };
  assert.deepEqual(weeklyDates(s, "2026-10-31"), ["2026-10-04", "2026-10-11", "2026-10-25"]);
  assert.deepEqual(weeklyDates(s, "2026-10-31", "2026-10-11"), ["2026-10-25"]);
});

test("放送日から放送済みの話数と未消化を出す（総話数で止める）", () => {
  const w = anime({ schedule: { firstDate: "2026-10-04", firstNumber: 1, skipDates: [] }, progress: 2 });
  assert.equal(availableCount(w, "2026-10-31"), 4);
  assert.equal(unconsumedCount(w, "2026-10-31"), 2);
  assert.equal(availableCount({ ...w, total: 3 }, "2026-10-31"), 3);
  // 2期など、途中の話数から数え始める
  assert.equal(availableCount({ ...w, schedule: { firstDate: "2026-10-04", firstNumber: 13, skipDates: [] } }, "2026-10-31"), 16);
});

test("放送前は0話、数え方が無ければ未消化は分からない", () => {
  assert.equal(availableCount(anime({ schedule: { firstDate: "2026-11-05", firstNumber: 1, skipDates: [] } }), "2026-10-31"), 0);
  assert.equal(unconsumedCount(anime(), "2026-10-31"), null);
  assert.equal(unconsumedCount(anime({ latestKnown: 5, progress: 3 }), "2026-10-31"), 2);
});

test("＋1で位置が進み、完結と分かっているときだけ記録へ移る", () => {
  const w = anime({ total: 12, progress: 11, finished: true });
  const r = stepForward(w, "2026-10-31", "2026-10-31", NOW);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.work.progress, 12);
  assert.equal(r.work.status, "done");
  assert.equal(r.log.position, 12);

  const ongoing = anime({ total: 12, progress: 11, finished: null });
  const r2 = stepForward(ongoing, "2026-10-31", "2026-10-31", NOW);
  assert.ok(!("error" in r2) && r2.work.status === "active");
});

test("最後まで進んだら＋1しない", () => {
  const r = stepForward(anime({ total: 12, progress: 12 }), "2026-10-31", "2026-10-31", NOW);
  assert.ok("error" in r);
});

test("最新に追いついただけでは完了にしない", () => {
  assert.equal(isFullyConsumed(anime({ total: null, progress: 5, finished: true })), false);
  assert.equal(isFullyConsumed(anime({ total: 5, progress: 5, finished: false })), false);
  assert.equal(isFullyConsumed(anime({ total: 5, progress: 5, finished: true })), true);
});

test("週刊誌：休みの週を除いて未読の号を数え、＋1で次の号へ進む", () => {
  const w: Work = {
    ...emptyWork("magazine", NOW),
    title: "週刊誌",
    schedule: { firstDate: "2026-10-05", firstNumber: 1, skipDates: ["2026-10-19"] },
    readThrough: "2026-10-05",
  };
  assert.deepEqual(unreadIssues(w, "2026-10-31"), ["2026-10-12", "2026-10-26"]);
  assert.equal(unconsumedCount(w, "2026-10-31"), 2);
  const r = stepForward(w, "2026-10-31", "2026-10-31", NOW);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.work.readThrough, "2026-10-12");
  assert.equal(r.log.issueDate, "2026-10-12");
  const r2 = stepForward({ ...w, readThrough: "2026-10-26" }, "2026-10-31", "2026-10-31", NOW);
  assert.ok("error" in r2);
});

test("マンガ：既刊−読んだ巻、見たいからの＋1は進行中になる", () => {
  const w: Work = { ...emptyWork("manga", NOW), title: "マンガ", total: 10, progress: 7, status: "wish" };
  assert.equal(unconsumedCount(w, "2026-10-31"), 3);
  const r = stepForward(w, "2026-10-31", "2026-10-31", NOW);
  assert.ok(!("error" in r) && r.work.status === "active" && r.work.progress === 8);
});
