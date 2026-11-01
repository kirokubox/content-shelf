import { WEEKDAY_LABEL } from "./constants.js";
import type { DatePrecision } from "./types.js";

/** 日付キー（YYYY-MM-DD）を端末の日付で作る。toISOString の先頭10文字は日本時間0〜9時にずれるので使わない */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 日付キーを正午の Date にする（夏時間などで日付がずれないように） */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function weekdayOf(key: string): number {
  return parseDateKey(key).getDay();
}

/** 画面用：10月12日（月）。今年以外は年を付ける */
export function formatDate(key: string, today: string = todayKey()): string {
  const d = parseDateKey(key);
  const base = `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY_LABEL[d.getDay()]}）`;
  return key.slice(0, 4) === today.slice(0, 4) ? base : `${d.getFullYear()}年${base}`;
}

/** 画面用の短い形：10/12(月)。今年以外は年を付ける（2025/10/12(日)） */
export function formatDateShort(key: string, today: string = todayKey()): string {
  const d = parseDateKey(key);
  const md = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABEL[d.getDay()]})`;
  return key.slice(0, 4) === today.slice(0, 4) ? md : `${d.getFullYear()}/${md}`;
}

/** ISO の日時を端末の日付キーにする */
export function isoToDateKey(iso: string): string {
  return toDateKey(new Date(iso));
}

/** 何日前か（今日＝0） */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / 86400000);
}

/** 記録の日付を細かさに合わせて出す（年だけ＝2015年、年月だけ＝2015年3月。今年なら年を省く） */
export function formatLogDate(key: string, precision: DatePrecision | undefined, today: string = todayKey(), short = false): string {
  const y = key.slice(0, 4);
  const sameYear = y === today.slice(0, 4);
  if (precision === "year") return `${y}年`;
  if (precision === "month") {
    const m = Number(key.slice(5, 7));
    if (short) return sameYear ? `${m}月` : `${y}/${m}月`;
    return sameYear ? `${m}月` : `${y}年${m}月`;
  }
  return short ? formatDateShort(key, today) : formatDate(key, today);
}

/** 入力欄の値（日付・年月・年）を記録の日付キーにする。正しくなければ null */
export function dateKeyFromInput(value: string, precision: DatePrecision): string | null {
  const v = value.trim().normalize("NFKC");
  if (precision === "year") return /^\d{4}$/.test(v) ? `${v}-01-01` : null;
  if (precision === "month") return /^\d{4}-\d{2}$/.test(v) ? `${v}-01` : null;
  return isDateKey(v) ? v : null;
}

/** 記録の日付キーを入力欄の値にする */
export function inputFromDateKey(key: string, precision: DatePrecision): string {
  if (precision === "year") return key.slice(0, 4);
  if (precision === "month") return key.slice(0, 7);
  return key;
}
