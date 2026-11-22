// ホームに出す積読：選んだ1冊を優先、無ければ積読の小説から日替わり（v0.22.0）。架空データだけを使う
import { test } from "node:test";
import assert from "node:assert/strict";
import { homeTsundoku } from "../src/progressLogic.js";
import { emptyWork } from "../src/workFactory.js";
import type { Work } from "../src/types.js";

const NOW = "2026-11-23T03:00:00.000Z";
const owned = (id: string, medium: Work["medium"], patch: Partial<Work> = {}): Work => {
  const w = emptyWork(medium, NOW);
  return { ...w, id, title: id, status: "wish", purchase: { ...w.purchase, stage: "owned" }, ...patch };
};

test("選んだ1冊があれば、それを出す（ランダムではない）", () => {
  const works = [owned("n1", "novel"), owned("m1", "manga", { homePick: true })];
  assert.deepEqual(homeTsundoku(works, "2026-11-23"), { id: "m1", random: false });
});

test("選んでいなければ積読の小説から1冊。同じ日は同じ本、マンガや未所持は選ばない", () => {
  const works = [owned("n1", "novel"), owned("n2", "novel"), owned("n3", "novel"), owned("m1", "manga"), { ...owned("n4", "novel"), status: "done" as const }];
  const a = homeTsundoku(works, "2026-11-23");
  assert.ok(a && a.random && ["n1", "n2", "n3"].includes(a.id));
  assert.deepEqual(homeTsundoku([...works].reverse(), "2026-11-23"), a);
  const ids = new Set(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"].map((d) => homeTsundoku(works, d)?.id));
  assert.ok(ids.size > 1, "日によって変わる");
});

test("積読の小説が無ければ出さない。消した作品も選ばない", () => {
  assert.equal(homeTsundoku([owned("m1", "manga"), { ...owned("n1", "novel"), deletedAt: NOW }], "2026-11-23"), null);
});
