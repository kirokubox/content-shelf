import { test } from "node:test";
import assert from "node:assert/strict";
import { planUpdate } from "../src/backup.js";
import { markBoughtNext, markNewVolume, unpurchasedCount } from "../src/progressLogic.js";
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
