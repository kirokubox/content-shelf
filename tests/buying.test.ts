import { test } from "node:test";
import assert from "node:assert/strict";
import { planUpdate } from "../src/backup.js";
import { markBoughtNext, markNewVolume, ownedGapSummary, unpurchasedCount } from "../src/progressLogic.js";
import { emptyWork } from "../src/workFactory.js";
import type { DataSet, Work } from "../src/types.js";

const NOW = "2026-10-31T03:00:00.000Z";

function manga(patch: Partial<Work> = {}): Work {
  return { ...emptyWork("manga", NOW), title: "架空マンガ", buying: true, latestKnown: 12, owned: { known: true, ranges: [{ from: 1, to: 10 }], medium: "paper", place: "home" }, ...patch };
}

test("新刊を買うシリーズだけ、既刊−持っている最大の巻を未購入として数える", () => {
  assert.equal(unpurchasedCount(manga()), 2);
  assert.equal(unpurchasedCount(manga({ buying: false })), 0);
  assert.equal(unpurchasedCount(manga({ latestKnown: null, total: null })), 0);
});

test("所持最大巻までの抜けを、数と範囲で返す", () => {
  assert.deepEqual(
    ownedGapSummary(manga({ owned: { known: true, ranges: [{ from: 1, to: 5 }, { from: 8, to: 8 }, { from: 12, to: 18 }], medium: "paper", place: "home" } })),
    { count: 5, ranges: [{ from: 6, to: 7 }, { from: 9, to: 11 }], text: "6-7, 9-11" },
  );
  assert.deepEqual(ownedGapSummary(manga({ owned: { known: false, ranges: [{ from: 3, to: 3 }], medium: null, place: null } })), { count: 0, ranges: [], text: "" });
  assert.deepEqual(ownedGapSummary(manga({ owned: { known: true, ranges: [], medium: null, place: null } })), { count: 0, ranges: [], text: "" });
});

test("抜けは未購入の数と、買ったボタンの次巻を変えない", () => {
  const work = manga({ latestKnown: 12, owned: { known: true, ranges: [{ from: 1, to: 4 }, { from: 6, to: 10 }], medium: "paper", place: "home" } });
  assert.equal(ownedGapSummary(work).count, 1);
  assert.equal(unpurchasedCount(work), 2);
  assert.deepEqual(markBoughtNext(work, NOW).owned?.ranges, [{ from: 1, to: 4 }, { from: 6, to: 11 }]);
});

test("買った：持っている範囲をのばす。離れていれば新しい範囲", () => {
  const a = markBoughtNext(manga(), NOW);
  assert.deepEqual(a.owned?.ranges, [{ from: 1, to: 11 }]);
  assert.equal(unpurchasedCount(a), 1);
  const b = markBoughtNext(manga({ owned: { known: true, ranges: [], medium: null, place: null } }), NOW);
  assert.deepEqual(b.owned?.ranges, [{ from: 1, to: 1 }]);
});

test("新刊が出た：既刊を1つ増やし、完結していた印は外す", () => {
  const n = markNewVolume(manga({ finished: true, total: 12, latestKnown: null }), NOW);
  assert.equal(n.latestKnown, 13);
  assert.equal(n.finished, false);
  assert.equal(unpurchasedCount(n), 3);
});

test("更新の取り込み：取り込む方が新しいものだけ上書きし、無いものは足す", () => {
  const old = manga({ updatedAt: "2026-10-01T00:00:00.000Z" });
  const mine = manga({ updatedAt: "2026-10-30T00:00:00.000Z" });
  const cur: DataSet = { franchises: [], logs: [], people: [], works: [old, mine] };
  const fresh = { ...emptyWork("movie", NOW), title: "新しい映画" };
  const inc: DataSet = {
    franchises: [], logs: [], people: [],
    works: [{ ...old, latestKnown: 13, updatedAt: NOW }, { ...mine, latestKnown: 99, updatedAt: "2026-10-20T00:00:00.000Z" }, fresh],
  };
  const plan = planUpdate(cur, inc);
  assert.deepEqual(plan.counts[0], { label: "作品", added: 1, updated: 1, kept: 1 });
  assert.equal(plan.changes.works.find((w) => w.id === old.id)?.latestKnown, 13);
  assert.equal(plan.changes.works.some((w) => w.id === mine.id), false);
});
