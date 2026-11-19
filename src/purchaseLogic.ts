// 購入の計算：まだ買っていない巻・巻を選んで買う／予約する・購入画面の一覧。純粋ロジック（v0.17.0）
// 購入の操作は、見る・読む進み具合（progress・status・readThrough）と並び順（touchedAt）を変えない
import { compareFuzzy, isPastFuzzy, workExpect } from "./expectLogic.js";
import { nowIso } from "./dateUtils.js";
import { availableCount } from "./progressLogic.js";
import type { DigitalStore, FuzzyDate, Ownership, PurchaseStage, RangeMedium, VolumeRange, Work } from "./types.js";

/** 巻の範囲を巻の番号の並びにする（重なりは1つに） */
export function volumeList(ranges: readonly VolumeRange[] | undefined): number[] {
  const s = new Set<number>();
  for (const r of ranges ?? []) for (let n = r.from; n <= r.to && n - r.from < 5000; n += 1) s.add(n);
  return Array.from(s).sort((a, b) => a - b);
}

/** 巻の番号の並びを、つながった範囲にまとめる（3,4,5,7 → 3-5, 7） */
export function compressVolumes(nums: readonly number[]): VolumeRange[] {
  const sorted = Array.from(new Set(nums)).sort((a, b) => a - b);
  const out: VolumeRange[] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && last.to === n - 1) last.to = n;
    else out.push({ from: n, to: n });
  }
  return out;
}

/** 「3, 5-7」 */
export function volumesText(nums: readonly number[]): string {
  return compressVolumes(nums).map((r) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`)).join(", ");
}

function emptyOwned(): Ownership {
  return { known: true, ranges: [], reserved: [], place: null, volumeDates: [] };
}

/**
 * まだ買っていない巻：1巻〜既刊のうち、持っている巻にも予約中の巻にも無いもの（飛び飛びで持っていても数える）。
 * 既刊より先の巻でも、巻ごとの楽しみの日（発売日）が入っていれば「買う予定の巻」として入れる
 */
export function unboughtVolumes(work: Work): number[] {
  if (work.medium !== "manga") return [];
  const latest = availableCount(work, "9999-12-31") ?? 0;
  const owned = new Set(volumeList(work.owned?.ranges));
  const reserved = new Set(volumeList(work.owned?.reserved));
  const out = new Set<number>();
  for (let n = 1; n <= latest && n <= 5000; n += 1) if (!owned.has(n) && !reserved.has(n)) out.add(n);
  for (const v of work.owned?.volumeDates ?? []) if (!owned.has(v.volume) && !reserved.has(v.volume)) out.add(v.volume);
  return Array.from(out).sort((a, b) => a - b);
}

/** 形（紙／電子＋2段目） */
export interface Shape {
  medium: RangeMedium;
  store: DigitalStore | null;
}

/** 作品の購入の形から、これから買う巻の形の既定（マンガだけ。無ければ最後の範囲の形） */
export function defaultShape(work: Work): Shape {
  if (work.purchase.format === "paper") return { medium: "paper", store: null };
  if (work.purchase.format === "digital") return { medium: "digital", store: work.purchase.store };
  const last = [...(work.owned?.ranges ?? [])].sort((a, b) => b.to - a.to)[0];
  return last ? { medium: last.medium ?? null, store: last.store ?? null } : { medium: null, store: null };
}

function sameShape(r: VolumeRange, s: Shape): boolean {
  return (r.medium ?? null) === s.medium && (s.medium !== "digital" || (r.store ?? null) === s.store);
}

/** 範囲に巻を足す。同じ形でつながる範囲はのばす */
export function addVolumes(ranges: readonly VolumeRange[], nums: readonly number[], shape: Shape): VolumeRange[] {
  const out = ranges.map((r) => ({ ...r }));
  for (const piece of compressVolumes(nums)) {
    const before = out.find((r) => r.to === piece.from - 1 && sameShape(r, shape));
    if (before) before.to = piece.to;
    else out.push({ from: piece.from, to: piece.to, medium: shape.medium, store: shape.medium === "digital" ? shape.store : null });
  }
  // のばした結果、後ろの範囲とつながったらまとめる
  out.sort((a, b) => a.from - b.from);
  const merged: VolumeRange[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && last.to === r.from - 1 && (last.medium ?? null) === (r.medium ?? null) && (last.store ?? null) === (r.store ?? null)) last.to = r.to;
    else merged.push({ ...r });
  }
  return merged;
}

/** 範囲から巻を取り除く */
export function removeVolumes(ranges: readonly VolumeRange[], nums: readonly number[]): VolumeRange[] {
  const drop = new Set(nums);
  const out: VolumeRange[] = [];
  for (const r of ranges) {
    let start: number | null = null;
    for (let n = r.from; n <= r.to + 1; n += 1) {
      const keep = n <= r.to && !drop.has(n);
      if (keep && start === null) start = n;
      if (!keep && start !== null) {
        out.push({ ...r, from: start, to: n - 1 });
        start = null;
      }
    }
  }
  return out;
}

export type PurchaseResult = { work: Work } | { error: string };

/**
 * 巻を選んで「買った」：持っている巻へ足し、予約中だった巻は予約から外し、その巻の楽しみの日も消す。
 * すでに持っている巻があれば何もしないで理由を返す（同じ巻を2回買えない）
 */
export function buyVolumes(work: Work, nums: readonly number[], shape: Shape, now: string = nowIso()): PurchaseResult {
  const list = Array.from(new Set(nums)).filter((n) => Number.isInteger(n) && n >= 1).sort((a, b) => a - b);
  if (list.length === 0) return { error: "買った巻を選んでください" };
  const owned = work.owned ?? emptyOwned();
  const have = new Set(volumeList(owned.ranges));
  const dup = list.filter((n) => have.has(n));
  if (dup.length > 0) return { error: `${volumesText(dup)}巻はもう持っています` };
  const format = work.purchase.format ?? (shape.medium === "paper" ? "paper" : shape.medium === "digital" ? "digital" : null);
  return {
    work: {
      ...work,
      owned: {
        ...owned,
        known: true,
        ranges: addVolumes(owned.ranges, list, shape),
        reserved: removeVolumes(owned.reserved, list),
        volumeDates: owned.volumeDates.filter((v) => !list.includes(v.volume)),
      },
      purchase: { stage: "owned", format, store: format === "digital" ? (work.purchase.format === "digital" ? work.purchase.store : shape.store) : null },
      updatedAt: now,
    },
  };
}

/** 巻を選んで「予約した」：持っている巻・予約中の巻とは重ねない */
export function reserveVolumes(work: Work, nums: readonly number[], shape: Shape, now: string = nowIso()): PurchaseResult {
  const list = Array.from(new Set(nums)).filter((n) => Number.isInteger(n) && n >= 1).sort((a, b) => a - b);
  if (list.length === 0) return { error: "予約した巻を選んでください" };
  const owned = work.owned ?? emptyOwned();
  const have = new Set(volumeList(owned.ranges));
  const res = new Set(volumeList(owned.reserved));
  const dupOwned = list.filter((n) => have.has(n));
  if (dupOwned.length > 0) return { error: `${volumesText(dupOwned)}巻はもう持っています` };
  const dupRes = list.filter((n) => res.has(n));
  if (dupRes.length > 0) return { error: `${volumesText(dupRes)}巻はもう予約しています` };
  return {
    work: {
      ...work,
      owned: { ...owned, reserved: addVolumes(owned.reserved, list, shape) },
      // 1冊も持っていないシリーズは、作品の段階も予約済みに（持っている巻があれば「持ってる」のまま）
      purchase: { ...work.purchase, stage: owned.ranges.length > 0 ? work.purchase.stage : "reserved" },
      updatedAt: now,
    },
  };
}

/** 単巻のもの（小説・映像・ゲームなど）：購入の段階を変えるだけ */
export function setPurchaseStage(work: Work, stage: PurchaseStage, now: string = nowIso()): Work {
  return { ...work, purchase: { ...work.purchase, stage }, updatedAt: now };
}

/** マンガの巻ごとの楽しみの日を入れる・消す（date が null で消す） */
export function setVolumeDate(work: Work, volume: number, date: FuzzyDate | null, now: string = nowIso()): Work {
  const owned = work.owned ?? emptyOwned();
  const rest = owned.volumeDates.filter((v) => v.volume !== volume);
  const volumeDates = date ? [...rest, { volume, date }].sort((a, b) => a.volume - b.volume) : rest;
  return { ...work, owned: { ...owned, volumeDates }, updatedAt: now };
}

export type PurchaseTab = "planned" | "reserved" | "owned";

export interface PurchaseItem {
  work: Work;
  /** マンガ：その一覧に関係する巻（買う予定＝まだ買っていない巻、予約済み＝予約中の巻、持ってる＝持っている巻）。単巻は空 */
  volumes: number[];
  /** 楽しみの日（マンガは関係する巻の中でいちばん近い日。無ければ作品の楽しみの日） */
  date: FuzzyDate | null;
  /** 予約済みで、楽しみの日を過ぎたもの（自動で「持ってる」には変えない） */
  overdue: boolean;
}

function datesFor(work: Work, vols: readonly number[]): FuzzyDate | null {
  const set = new Set(vols);
  const ds = (work.owned?.volumeDates ?? []).filter((v) => set.has(v.volume)).map((v) => v.date).sort(compareFuzzy);
  return ds[0] ?? workExpect(work);
}

/** その作品が、購入画面のその一覧に出るか（出るなら中身） */
export function purchaseItem(work: Work, tab: PurchaseTab, today: string): PurchaseItem | null {
  if (work.deletedAt !== null) return null;
  const stage = work.purchase.stage;
  if (work.medium === "manga") {
    const ranges = work.owned?.ranges ?? [];
    const reserved = work.owned?.reserved ?? [];
    if (tab === "planned") {
      const vols = unboughtVolumes(work);
      // 「続きの巻も買う」の印か、作品が買う予定。印だけで、もう買う巻が無いものは出さない
      if (!(stage === "planned" || (work.buying && vols.length > 0))) return null;
      return { work, volumes: vols, date: vols.length > 0 ? datesFor(work, vols) : workExpect(work), overdue: false };
    }
    if (tab === "reserved") {
      const vols = volumeList(reserved);
      if (vols.length === 0 && !(stage === "reserved" && ranges.length === 0)) return null;
      const date = vols.length > 0 ? datesFor(work, vols) : workExpect(work);
      return { work, volumes: vols, date, overdue: date !== null && isPastFuzzy(date, today) };
    }
    const vols = volumeList(ranges);
    if (vols.length === 0 && stage !== "owned") return null;
    return { work, volumes: vols, date: null, overdue: false };
  }
  if (stage !== tab) return null;
  const date = workExpect(work);
  return { work, volumes: [], date: tab === "owned" ? null : date, overdue: tab === "reserved" && date !== null && isPastFuzzy(date, today) };
}

/**
 * 購入画面の一覧。並び：（予約済みは、発売日を過ぎたものを一番上に）→ 楽しみの日が近い順 → 追加した順（古いものから）
 */
export function purchaseList(works: readonly Work[], tab: PurchaseTab, today: string): PurchaseItem[] {
  const items = works.map((w) => purchaseItem(w, tab, today)).filter((x): x is PurchaseItem => x !== null);
  return items.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.date && b.date) return compareFuzzy(a.date, b.date) || a.work.createdAt.localeCompare(b.work.createdAt);
    if (a.date || b.date) return a.date ? -1 : 1;
    return a.work.createdAt.localeCompare(b.work.createdAt);
  });
}
