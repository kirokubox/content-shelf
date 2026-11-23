// 一覧の並び順（v0.19.0）。純粋ロジック。
// 共通ルール：
//  - 同じ名前の並び順は、どの画面でも同じ意味（題名＝読み仮名→題名、記録日＝最後に記録した日、最近触った＝touchedAt、楽しみの日＝expect）
//  - 画面にもともとある枠（追いついている・やめたもの・発売日を過ぎた予約・積読を先に・原作を先に）は崩さず、枠の中だけを並べ替える（枠は呼び出し側）
//  - 値が無い作品は、向きに関係なく常に最後。同じ順位のときは題名順
//  - 日付の並び順は向きを切り替えられる。題名は五十音順だけ
import { compareFuzzy } from "./expectLogic.js";
import { compareAirSlot } from "./airSlot.js";
import type { AirSlot, FuzzyDate, Log, Medium, Person, Work } from "./types.js";

export type SortKey = "title" | "touched" | "logged" | "expect" | "airslot" | "author" | "released";
export type SortDir = "asc" | "desc";
export interface SortPref {
  key: SortKey;
  dir: SortDir;
}

export const SORT_LABEL: Record<SortKey, string> = {
  title: "題名",
  touched: "最近触った",
  logged: "記録日",
  expect: "楽しみの日",
  airslot: "放送枠",
  author: "作者",
  released: "完結・発売日",
};

/** 作者・完結/発売日の並び順を出す種類（小説・マンガ・映像作品。v1.0.0） */
export const BOOK_SORT_KEYS: readonly SortKey[] = ["author", "released"];
export const BOOK_SORT_MEDIA: readonly Medium[] = ["novel", "manga", "video"];

/** 並び順を選び直したときの向き */
export const DEFAULT_DIR: Record<SortKey, SortDir> = { title: "asc", touched: "desc", logged: "desc", expect: "asc", airslot: "asc", author: "asc", released: "asc" };

/** 向きを切り替えられる並び順（題名は五十音順だけ、放送枠は月曜から日曜の順だけ） */
export function hasDirection(key: SortKey): boolean {
  return key !== "title" && key !== "airslot" && key !== "author";
}

/** 向きの言葉 */
export function dirLabel(key: SortKey, dir: SortDir): string {
  if (key === "title" || key === "author") return "五十音順";
  if (key === "airslot") return "月曜から";
  if (key === "expect") return dir === "asc" ? "近い順" : "遠い順";
  return dir === "desc" ? "新しい順" : "古い順";
}

/** 並び順を記憶する単位（画面とタブの組み合わせ）。種類のチップを切り替えても変えない */
export type SortScope =
  | "continue-current"
  | "continue-partway"
  | "continue-planned"
  | "purchase-planned"
  | "purchase-reserved"
  | "purchase-owned"
  | "relation"
  | "records"
  | "work-logs"
  | "cour";

/** 画面ごとの選択肢。先頭が既定 */
export const SORT_OPTIONS: Record<SortScope, readonly SortKey[]> = {
  "continue-current": ["touched", "logged", "title", "author", "released"],
  "continue-partway": ["title", "touched", "logged", "author", "released"],
  "continue-planned": ["touched", "expect", "title", "author", "released"],
  "purchase-planned": ["expect", "title", "touched", "author", "released"],
  "purchase-reserved": ["expect", "title", "touched", "author", "released"],
  "purchase-owned": ["touched", "title", "author", "released"],
  relation: ["logged", "title"],
  records: ["logged"],
  "work-logs": ["logged"],
  cour: ["airslot", "title"],
};

/** その画面で選べる並び順。作者・完結/発売日は、種類を小説・マンガ・映像作品に絞ったときだけ（v1.0.0） */
export function sortOptionsFor(scope: SortScope, medium: Medium | null): readonly SortKey[] {
  const bookLike = medium !== null && BOOK_SORT_MEDIA.includes(medium);
  return SORT_OPTIONS[scope].filter((k) => bookLike || !BOOK_SORT_KEYS.includes(k));
}

/** 記憶していた並び順が今の絞り込みで選べなければ、その画面の既定で並べる（記憶は変えない） */
export function effectivePref(scope: SortScope, pref: SortPref, medium: Medium | null): SortPref {
  return sortOptionsFor(scope, medium).includes(pref.key) ? pref : defaultSortPref(scope);
}

/** 並べ替え用の作者：最初の人物の読み仮名（無ければ名前） */
export function authorKeyOf(w: Pick<Work, "personIds">, peopleById: ReadonlyMap<string, Pick<Person, "name" | "kana" | "deletedAt">>): string | null {
  for (const id of w.personIds) {
    const p = peopleById.get(id);
    if (p && p.deletedAt === null) return (p.kana || p.name).normalize("NFKC");
  }
  return null;
}

/** 並べ替え用の完結・発売日：マンガは完結した日、ほか（小説・映像作品）は発売日（楽しみの日の項目） */
export function releasedOf(w: Pick<Work, "medium" | "endDate" | "expect">): FuzzyDate | null {
  return w.medium === "manga" ? w.endDate ?? null : w.expect;
}

export function defaultSortPref(scope: SortScope): SortPref {
  const key = SORT_OPTIONS[scope][0];
  return { key, dir: DEFAULT_DIR[key] };
}

/** localStorage から読んだ値を整える。その画面に無い並び順・壊れた値は既定へ戻す */
export function parseSortPref(scope: SortScope, value: unknown): SortPref {
  const fallback = defaultSortPref(scope);
  if (typeof value !== "object" || value === null) return fallback;
  const v = value as { key?: unknown; dir?: unknown };
  const key = SORT_OPTIONS[scope].find((k) => k === v.key);
  if (!key) return fallback;
  if (!hasDirection(key)) return { key, dir: "asc" };
  return { key, dir: v.dir === "asc" || v.dir === "desc" ? v.dir : DEFAULT_DIR[key] };
}

/** 並び順を選び直す：向きはその並び順の既定に戻す */
export function choosePref(key: SortKey): SortPref {
  return { key, dir: DEFAULT_DIR[key] };
}

export function flipPref(pref: SortPref): SortPref {
  if (!hasDirection(pref.key)) return pref;
  return { ...pref, dir: pref.dir === "asc" ? "desc" : "asc" };
}

/** 並べ替え用の題名：読み仮名があれば読み仮名、無ければ題名（全角・半角の揺れはそろえる） */
export function titleKey(w: Pick<Work, "title" | "kana">): string {
  return (w.kana || w.title).normalize("NFKC");
}

export function compareTitle(a: Pick<Work, "title" | "kana">, b: Pick<Work, "title" | "kana">): number {
  return titleKey(a).localeCompare(titleKey(b), "ja") || a.title.localeCompare(b.title, "ja");
}

/** 作品ごとの最後に記録した日（消した記録は数えない） */
export function lastLoggedMap(logs: readonly Log[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of logs) {
    if (l.deletedAt !== null) continue;
    const cur = out.get(l.workId);
    if (cur === undefined || l.date > cur) out.set(l.workId, l.date);
  }
  return out;
}

export interface SortSource<T> {
  work: (item: T) => Work;
  /** 記録日（無ければ null）。作品なら最後に記録した日 */
  logged?: (item: T) => string | null;
  /** 楽しみの日（無ければ null） */
  expect?: (item: T) => FuzzyDate | null;
  /** 作者の並べ替え用の文字（無ければ null） */
  author?: (item: T) => string | null;
  /** 完結・発売日（無ければ null） */
  released?: (item: T) => FuzzyDate | null;
}

/** 値の比べ方。無い値は向きに関係なく最後 */
function compareNullable<V>(a: V | null, b: V | null, cmp: (x: V, y: V) => number, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const c = cmp(a, b);
  return dir === "asc" ? c : -c;
}

const compareText = (a: string, b: string) => a.localeCompare(b);

/** 一覧を並べ替える（元の配列は変えない） */
export function sortItems<T>(items: readonly T[], pref: SortPref, src: SortSource<T>): T[] {
  const byTitle = (a: T, b: T) => compareTitle(src.work(a), src.work(b)) || src.work(a).id.localeCompare(src.work(b).id);
  const primary = (a: T, b: T): number => {
    switch (pref.key) {
      case "title":
        return 0;
      case "touched":
        return compareNullable(src.work(a).touchedAt || null, src.work(b).touchedAt || null, compareText, pref.dir);
      case "logged":
        return compareNullable(src.logged?.(a) ?? null, src.logged?.(b) ?? null, compareText, pref.dir);
      case "expect":
        return compareNullable(src.expect?.(a) ?? null, src.expect?.(b) ?? null, compareFuzzy, pref.dir);
      case "airslot":
        return compareNullable<AirSlot>(src.work(a).airSlot, src.work(b).airSlot, compareAirSlot, "asc");
      case "author":
        return compareNullable(src.author?.(a) ?? null, src.author?.(b) ?? null, (x, y) => x.localeCompare(y, "ja"), "asc");
      case "released":
        return compareNullable(src.released?.(a) ?? null, src.released?.(b) ?? null, compareFuzzy, pref.dir);
    }
  };
  return [...items].sort((a, b) => primary(a, b) || byTitle(a, b));
}

/** 作品の一覧を並べ替える（記録日は lastLogged から、楽しみの日は expectOf から） */
export function sortWorks(works: readonly Work[], pref: SortPref, ctx: { lastLogged?: Map<string, string>; expectOf?: (w: Work) => FuzzyDate | null; peopleById?: ReadonlyMap<string, Person> }): Work[] {
  return sortItems(works, pref, {
    work: (w) => w,
    logged: (w) => ctx.lastLogged?.get(w.id) ?? null,
    expect: (w) => ctx.expectOf?.(w) ?? null,
    author: (w) => (ctx.peopleById ? authorKeyOf(w, ctx.peopleById) : null),
    released: (w) => releasedOf(w),
  });
}
