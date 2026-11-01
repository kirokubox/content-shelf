// テキスト書き出しの期間（週・月）。週は振り返りと同じ月曜〜日曜、番号はISO週（W44など）
import { addDays, parseDateKey, toDateKey } from "./dateUtils.js";
import type { DatePrecision } from "./types.js";

export type ExportUnit = "week" | "month" | "all";

export interface ExportRange {
  from: string;
  to: string;
  /** 画面と見出し用：2026年W44（10/26〜11/1）、2026年10月 */
  label: string;
  /** ファイル名用：2026-W44、2026-10 */
  key: string;
  /** 画面の見出し：2026年W44、2026年10月 */
  title: string;
  /** 週の日付：10/26〜11/1（月は空） */
  dates: string;
}

/** その日を含む週の月曜 */
export function weekStart(key: string): string {
  const day = parseDateKey(key).getDay();
  return addDays(key, -((day + 6) % 7));
}

/** ISO週の年と番号（その週の木曜が属する年） */
export function isoWeek(key: string): { year: number; week: number } {
  const thursday = addDays(weekStart(key), 3);
  const year = Number(thursday.slice(0, 4));
  const firstThursday = addDays(weekStart(`${year}-01-04`), 3);
  const week = Math.round((parseDateKey(thursday).getTime() - parseDateKey(firstThursday).getTime()) / (7 * 86400000)) + 1;
  return { year, week };
}

function md(key: string): string {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}

/** today を基準に、offset 個前（-1＝先週・先月）の期間 */
export function exportRange(unit: "week" | "month", today: string, offset: number): ExportRange {
  if (unit === "week") {
    const from = addDays(weekStart(today), offset * 7);
    const to = addDays(from, 6);
    const { year, week } = isoWeek(from);
    const w = String(week).padStart(2, "0");
    const dates = `${md(from)}〜${md(to)}`;
    return { from, to, label: `${year}年W${w}（${dates}）`, key: `${year}-W${w}`, title: `${year}年W${w}`, dates };
  }
  const d = parseDateKey(today);
  const first = new Date(d.getFullYear(), d.getMonth() + offset, 1, 12);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12);
  const from = toDateKey(first);
  const title = `${first.getFullYear()}年${first.getMonth() + 1}月`;
  return { from, to: toDateKey(last), label: title, key: from.slice(0, 7), title, dates: "" };
}

/**
 * 記録がその期間に入るか。年だけ・年月だけの記録は、その年・月がまるごと期間に入るときだけ数える
 * （年月だけの記録を、1日を含む週に入れてしまわないように）
 */
export function logInRange(date: string, precision: DatePrecision | undefined, range: { from: string; to: string }): boolean {
  let start = date;
  let end = date;
  if (precision === "year") {
    start = `${date.slice(0, 4)}-01-01`;
    end = `${date.slice(0, 4)}-12-31`;
  } else if (precision === "month") {
    start = `${date.slice(0, 7)}-01`;
    end = toDateKey(new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0, 12));
  }
  return start >= range.from && end <= range.to;
}
