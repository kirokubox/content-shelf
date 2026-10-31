import { WEEKDAY_LABEL } from "./constants.js";

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

/** 画面用の短い形：10/12(月) */
export function formatDateShort(key: string): string {
  const d = parseDateKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABEL[d.getDay()]})`;
}

/** ISO の日時を端末の日付キーにする */
export function isoToDateKey(iso: string): string {
  return toDateKey(new Date(iso));
}

/** 何日前か（今日＝0） */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / 86400000);
}
