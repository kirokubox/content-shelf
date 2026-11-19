// 購入画面・巻を選んで買う／予約する（v0.17.0）。架空データだけを使う
import { test } from "node:test";
import assert from "node:assert/strict";
import { addVolumes, buyVolumes, compressVolumes, purchaseList, removeVolumes, reserveVolumes, setPurchaseStage, unboughtVolumes, volumeList, volumesText } from "../src/purchaseLogic.js";
import { emptyWork } from "../src/workFactory.js";
import type { Work } from "../src/types.js";

const NOW = "2026-11-19T03:00:00.000Z";
const TODAY = "2026-11-19";
const PAPER = { medium: "paper" as const, store: null };
const KINDLE = { medium: "digital" as const, store: "kindle" as const };

function manga(patch: Partial<Work> = {}, owned: Partial<NonNullable<Work["owned"]>> = {}): Work {
  return {
    ...emptyWork("manga", NOW),
    title: "架空マンガ",
    status: "active",
    latestKnown: 10,
    progress: 4,
    owned: { known: true, ranges: [{ from: 1, to: 3, medium: "paper", store: null }, { from: 5, to: 5, medium: "paper", store: null }, { from: 8, to: 8, medium: "paper", store: null }], reserved: [{ from: 10, to: 10, medium: "paper", store: null }], place: null, volumeDates: [], ...owned },
    ...patch,
  };
}

test("まだ買っていない巻：飛び飛びで持っていても、抜けている巻を番号で出す。予約中の巻は入れない", () => {
  assert.deepEqual(unboughtVolumes(manga()), [4, 6, 7, 9]);
  assert.equal(volumesText(unboughtVolumes(manga())), "4, 6-7, 9");
  // 既刊が分からなければ候補なし。ただし巻ごとの発売日がある先の巻は「買う予定の巻」
  assert.deepEqual(unboughtVolumes(manga({ latestKnown: null, total: null })), []);
  assert.deepEqual(unboughtVolumes(manga({}, { volumeDates: [{ volume: 11, date: { date: "2026-12-04", precision: "day" } }] })), [4, 6, 7, 9, 11]);
  assert.deepEqual(unboughtVolumes({ ...emptyWork("novel", NOW) }), []);
});

test("巻の並びと範囲の行き来", () => {
  assert.deepEqual(compressVolumes([7, 3, 4, 5, 5]), [{ from: 3, to: 5 }, { from: 7, to: 7 }]);
  assert.deepEqual(volumeList([{ from: 2, to: 4 }, { from: 3, to: 5 }]), [2, 3, 4, 5]);
  assert.deepEqual(removeVolumes([{ from: 1, to: 5 }], [3]), [{ from: 1, to: 2 }, { from: 4, to: 5 }]);
  // 同じ形ならのばしてつなぐ、形が違えば別の範囲
  assert.deepEqual(addVolumes([{ from: 1, to: 3, medium: "paper", store: null }, { from: 5, to: 5, medium: "paper", store: null }], [4], PAPER), [{ from: 1, to: 5, medium: "paper", store: null }]);
  assert.deepEqual(addVolumes([{ from: 1, to: 3, medium: "paper", store: null }], [4], KINDLE), [{ from: 1, to: 3, medium: "paper", store: null }, { from: 4, to: 4, medium: "digital", store: "kindle" }]);
});

test("巻を選んで買った：持っている巻へ移し、予約中だった巻は予約から外す。進み具合は変えない", () => {
  const w = manga({}, { volumeDates: [{ volume: 10, date: { date: "2026-11-01", precision: "day" } }] });
  const r = buyVolumes(w, [4, 10], PAPER, NOW);
  assert.ok("work" in r);
  if (!("work" in r)) return;
  assert.deepEqual(volumeList(r.work.owned!.ranges), [1, 2, 3, 4, 5, 8, 10]);
  assert.deepEqual(r.work.owned!.reserved, []);
  assert.deepEqual(r.work.owned!.volumeDates, []);
  assert.equal(r.work.purchase.stage, "owned");
  // 見る・読む進み具合と並び順は変えない
  for (const k of ["progress", "status", "latestKnown", "readThrough", "touchedAt", "rounds", "completedAt"] as const) assert.deepEqual(r.work[k], w[k], k);
  // 予約中の巻と持っている巻が重ならない
  const owned = new Set(volumeList(r.work.owned!.ranges));
  assert.ok(volumeList(r.work.owned!.reserved).every((n) => !owned.has(n)));
});

test("同じ巻を2回買えない・持っている巻や予約中の巻は予約できない", () => {
  const w = manga();
  assert.deepEqual(buyVolumes(w, [5], PAPER, NOW), { error: "5巻はもう持っています" });
  assert.deepEqual(buyVolumes(w, [], PAPER, NOW), { error: "買った巻を選んでください" });
  const once = buyVolumes(w, [6], PAPER, NOW);
  assert.ok("work" in once);
  if ("work" in once) assert.ok("error" in buyVolumes(once.work, [6], PAPER, NOW));
  assert.deepEqual(reserveVolumes(w, [3], PAPER, NOW), { error: "3巻はもう持っています" });
  assert.deepEqual(reserveVolumes(w, [10], PAPER, NOW), { error: "10巻はもう予約しています" });
  const res = reserveVolumes(w, [9], KINDLE, NOW);
  assert.ok("work" in res);
  if ("work" in res) {
    assert.deepEqual(volumeList(res.work.owned!.reserved), [9, 10]);
    assert.equal(res.work.progress, w.progress);
  }
});

test("買ったの取り消し：前の作品に戻せば、持っている巻・予約中の巻も元どおり", () => {
  const w = manga();
  const r = buyVolumes(w, [10], KINDLE, NOW);
  assert.ok("work" in r);
  if (!("work" in r)) return;
  const undone = { ...w };
  assert.deepEqual(undone.owned, w.owned);
  assert.deepEqual(volumeList(undone.owned!.reserved), [10]);
  // 電子・Kindle で買った巻だけが別の範囲になっている
  assert.deepEqual(r.work.owned!.ranges.find((x) => x.from === 10), { from: 10, to: 10, medium: "digital", store: "kindle" });
});

test("単巻のもの：段階を変えるだけ。進み具合は変えない", () => {
  const n = { ...emptyWork("novel", NOW), title: "架空小説", status: "wish" as const, purchase: { stage: "planned" as const, format: "bunko" as const, store: null } };
  const r = setPurchaseStage(n, "reserved", NOW);
  assert.equal(r.purchase.stage, "reserved");
  assert.equal(r.purchase.format, "bunko");
  assert.equal(r.status, "wish");
  assert.equal(r.touchedAt, n.touchedAt);
});

test("購入画面：買う予定／予約済み／持ってる。楽しみの日が近い順 → 追加した順、発売日を過ぎた予約は一番上", () => {
  const mk = (id: string, createdAt: string, patch: Partial<Work>) => ({ ...emptyWork("novel", NOW), id, title: id, createdAt, ...patch });
  const works: Work[] = [
    mk("old-planned", "2026-01-01T00:00:00.000Z", { purchase: { stage: "planned", format: null, store: null } }),
    mk("new-planned", "2026-05-01T00:00:00.000Z", { purchase: { stage: "planned", format: null, store: null } }),
    mk("dated-later", "2026-06-01T00:00:00.000Z", { purchase: { stage: "planned", format: null, store: null }, expect: { date: "2026-12-01", precision: "month" } }),
    mk("dated-soon", "2026-07-01T00:00:00.000Z", { purchase: { stage: "planned", format: null, store: null }, expect: { date: "2026-12-10", precision: "day" } }),
    mk("res-future", "2026-01-01T00:00:00.000Z", { purchase: { stage: "reserved", format: null, store: null }, expect: { date: "2026-12-20", precision: "day" } }),
    mk("res-overdue", "2026-02-01T00:00:00.000Z", { purchase: { stage: "reserved", format: null, store: null }, expect: { date: "2026-11-10", precision: "day" } }),
    mk("owned", "2026-01-01T00:00:00.000Z", { purchase: { stage: "owned", format: "bunko", store: null } }),
    manga({ id: "m", buying: true, createdAt: "2025-01-01T00:00:00.000Z" }),
  ];
  // 「12月」（月だけ）は12月10日より後ろ（月の末日で並べる）
  assert.deepEqual(purchaseList(works, "planned", TODAY).map((i) => i.work.id), ["dated-soon", "dated-later", "m", "old-planned", "new-planned"]);
  const reserved = purchaseList(works, "reserved", TODAY);
  assert.deepEqual(reserved.map((i) => i.work.id), ["res-overdue", "res-future", "m"]);
  assert.equal(reserved[0].overdue, true);
  assert.equal(reserved.find((i) => i.work.id === "res-future")!.overdue, false);
  assert.deepEqual(purchaseList(works, "owned", TODAY).map((i) => i.work.id), ["m", "owned"]);
  assert.deepEqual(purchaseList(works, "planned", TODAY).find((i) => i.work.id === "m")!.volumes, [4, 6, 7, 9]);
});
