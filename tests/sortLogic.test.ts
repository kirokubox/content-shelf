import { test } from "node:test";
import assert from "node:assert/strict";
import { choosePref, defaultSortPref, flipPref, lastLoggedMap, parseSortPref, sortItems, sortWorks } from "../src/sortLogic.js";
import { emptyWork, newLog } from "../src/workFactory.js";
import type { FuzzyDate, Work } from "../src/types.js";

const NOW = "2026-11-20T03:00:00.000Z";

function work(id: string, title: string, extra: Partial<Work> = {}): Work {
  return { ...emptyWork("movie", NOW), id, title, ...extra };
}

test("題名順は読み仮名を優先し、無ければ題名で並べる", () => {
  const works = [work("a", "架空の海", { kana: "かくうのうみ" }), work("b", "あおぞら"), work("c", "ＡＢＣ"), work("d", "空の旅", { kana: "そらのたび" })];
  const ids = sortWorks(works, choosePref("title"), {}).map((w) => w.id);
  assert.deepEqual(ids, ["c", "b", "a", "d"]);
});

test("記録日：記録の無い作品は向きに関係なく最後。同じ日なら題名順", () => {
  const works = [work("none", "あ"), work("old", "い"), work("newB", "け"), work("newA", "か")];
  const logs = [
    { ...newLog({ workId: "old", kind: "view", date: "2026-01-01" }, NOW) },
    { ...newLog({ workId: "newA", kind: "view", date: "2026-11-01" }, NOW) },
    { ...newLog({ workId: "newB", kind: "view", date: "2026-11-01" }, NOW) },
    { ...newLog({ workId: "newB", kind: "view", date: "2025-05-05" }, NOW) },
    { ...newLog({ workId: "old", kind: "view", date: "2026-12-31" }, NOW), deletedAt: NOW },
  ];
  const lastLogged = lastLoggedMap(logs);
  assert.equal(lastLogged.get("old"), "2026-01-01");
  const desc = sortWorks(works, choosePref("logged"), { lastLogged }).map((w) => w.id);
  assert.deepEqual(desc, ["newA", "newB", "old", "none"]);
  const asc = sortWorks(works, flipPref(choosePref("logged")), { lastLogged }).map((w) => w.id);
  assert.deepEqual(asc, ["old", "newA", "newB", "none"]);
});

test("楽しみの日は近い順が既定で、日付の無いものは最後", () => {
  const d = (date: string, precision: FuzzyDate["precision"] = "day"): FuzzyDate => ({ date, precision });
  const items = [
    { work: work("x", "x"), date: null },
    { work: work("m", "m"), date: d("2026-12-01", "month") },
    { work: work("s", "s"), date: d("2026-12-05") },
  ];
  const pref = choosePref("expect");
  assert.equal(pref.dir, "asc");
  assert.deepEqual(sortItems(items, pref, { work: (i) => i.work, expect: (i) => i.date }).map((i) => i.work.id), ["s", "m", "x"]);
  assert.deepEqual(sortItems(items, flipPref(pref), { work: (i) => i.work, expect: (i) => i.date }).map((i) => i.work.id), ["m", "s", "x"]);
});

test("記憶した並び順：その画面に無い並び順・壊れた値は既定に戻す", () => {
  assert.deepEqual(parseSortPref("continue-partway", null), { key: "title", dir: "asc" });
  assert.deepEqual(parseSortPref("continue-current", { key: "logged", dir: "asc" }), { key: "logged", dir: "asc" });
  assert.deepEqual(parseSortPref("purchase-owned", { key: "expect", dir: "asc" }), defaultSortPref("purchase-owned"));
  assert.deepEqual(parseSortPref("relation", { key: "title", dir: "desc" }), { key: "title", dir: "asc" });
  assert.deepEqual(parseSortPref("records", { key: "logged", dir: "sideways" }), { key: "logged", dir: "desc" });
  assert.deepEqual(flipPref(choosePref("title")), { key: "title", dir: "asc" });
});
