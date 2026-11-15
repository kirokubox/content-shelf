import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnabledMedia, toggleMedium, visibleFilterMedia, visibleMedia } from "../src/mediaPrefs.js";
import { monthLabel, monthSummary, shiftMonth } from "../src/summaryLogic.js";
import { MEDIA } from "../src/types.js";
import { emptyWork, newLog } from "../src/workFactory.js";

const NOW = "2026-11-15T03:00:00.000Z";

test("月のまとめ：その月に記録がある作品を、最初に記録した日の順に並べる", () => {
  const movie = { ...emptyWork("movie", NOW), title: "映画" };
  const anime = { ...emptyWork("anime", NOW), title: "アニメ" };
  const novel = { ...emptyWork("novel", NOW), title: "小説", status: "done" as const, completedAt: "2026-11-09T12:00:00.000Z" };
  const other = { ...emptyWork("movie", NOW), title: "先月の映画" };
  const logs = [
    newLog({ workId: anime.id, kind: "progress", date: "2026-11-10", position: 2 }, NOW),
    newLog({ workId: anime.id, kind: "progress", date: "2026-11-03", position: 1 }, NOW),
    newLog({ workId: movie.id, kind: "view", date: "2026-11-05", rating: 5 }, NOW),
    newLog({ workId: movie.id, kind: "view", date: "2026-11-20", rating: 3 }, NOW),
    newLog({ workId: novel.id, kind: "view", date: "2026-11-09", rating: 4 }, NOW),
    newLog({ workId: other.id, kind: "view", date: "2026-10-31", rating: 5 }, NOW),
  ];
  const s = monthSummary({ franchises: [], people: [], works: [movie, anime, novel, other], logs }, "2026-11");
  assert.deepEqual(s.works.map((w) => [w.workId, w.count, w.rating, w.firstDate]), [
    [anime.id, 2, null, "2026-11-03"],
    [movie.id, 2, 5, "2026-11-05"],
    [novel.id, 1, 4, "2026-11-09"],
  ]);
  assert.equal(s.totalLogs, 5);
  assert.equal(s.completed, 1);
  assert.deepEqual(s.byMedium, [
    { medium: "anime", works: 1, count: 2 },
    { medium: "novel", works: 1, count: 1 },
    { medium: "movie", works: 1, count: 2 },
  ]);
  // 星が4以上の作品だけ、星の高い順
  assert.deepEqual(s.topRated.map((w) => w.workId), [movie.id, novel.id]);
});

test("月のまとめ：削除した記録・作品と、年だけの記録は入れない。月だけの記録は入れる", () => {
  const movie = { ...emptyWork("movie", NOW), title: "映画" };
  const gone = { ...emptyWork("movie", NOW), title: "消した映画", deletedAt: NOW };
  const logs = [
    { ...newLog({ workId: movie.id, kind: "view", date: "2026-11-05" }, NOW), deletedAt: NOW },
    newLog({ workId: movie.id, kind: "view", date: "2026-01-01", datePrecision: "year" }, NOW),
    newLog({ workId: gone.id, kind: "view", date: "2026-11-06" }, NOW),
  ];
  const data = { franchises: [], people: [], works: [movie, gone], logs };
  assert.deepEqual(monthSummary(data, "2026-11").works, []);
  assert.deepEqual(monthSummary(data, "2026-01").works, []);
  const monthOnly = newLog({ workId: movie.id, kind: "view", date: "2026-03-01", datePrecision: "month" }, NOW);
  assert.equal(monthSummary({ ...data, logs: [monthOnly] }, "2026-03").works.length, 1);
});

test("月のまとめ：星が高い作品は最大6件", () => {
  const works = Array.from({ length: 8 }, (_, i) => ({ ...emptyWork("movie", NOW), title: `映画${i}` }));
  const logs = works.map((w, i) => newLog({ workId: w.id, kind: "view", date: `2026-11-${String(i + 1).padStart(2, "0")}`, rating: 5 }, NOW));
  assert.equal(monthSummary({ franchises: [], people: [], works, logs }, "2026-11").topRated.length, 6);
});

test("月の移動と表示：年をまたぐ", () => {
  assert.equal(shiftMonth("2026-11", 1), "2026-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-03", -14), "2025-01");
  assert.equal(monthLabel("2026-03"), "2026年3月");
});

test("使う種類：未設定・壊れた値は全部。選んだ種類だけを決まった順で出す", () => {
  assert.equal(parseEnabledMedia(null), null);
  assert.equal(parseEnabledMedia("manga"), null);
  assert.equal(parseEnabledMedia([]), null);
  assert.equal(parseEnabledMedia(["知らない種類"]), null);
  assert.deepEqual(parseEnabledMedia(["novel", "manga", "知らない種類"]), ["manga", "novel"]);
  assert.deepEqual(visibleMedia(null), [...MEDIA]);
  assert.deepEqual(visibleMedia(["novel", "manga"]), ["manga", "novel"]);
  assert.deepEqual(visibleFilterMedia(["anime", "manga", "novel"], ["manga", "novel"]), ["manga", "novel"]);
  assert.deepEqual(visibleFilterMedia(["anime", "movie"], ["manga", "novel"]), []);
});

test("使う種類：入れ外しできる。最後の1つは外せない", () => {
  assert.deepEqual(toggleMedium(["manga", "novel"], "novel"), ["manga"]);
  assert.deepEqual(toggleMedium(["manga"], "manga"), ["manga"]);
  assert.deepEqual(toggleMedium(["manga"], "anime"), ["anime", "manga"]);
  assert.equal(toggleMedium(null, "other").length, MEDIA.length - 1);
});
