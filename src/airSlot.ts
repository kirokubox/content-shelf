// 放送枠（v0.20.0）。純粋ロジック。
// 深夜 0:00〜4:59 は前日の 24:00〜28:59 として扱う（テレビ欄の「土曜25時」と同じ）。
import { WEEKDAY_LABEL } from "./constants.js";
import type { AirSlot } from "./types.js";

/** 日をまたいでも前日として扱う時刻の上限（5:00 より前） */
export const LATE_NIGHT_END_MINUTES = 5 * 60;
const DAY = 24 * 60;

/** 曜日と0:00からの分を、放送枠（前日の24〜28時へ寄せたもの）にする */
export function toAirSlot(weekday: number, minutesOfDay: number, source: AirSlot["source"]): AirSlot {
  if (minutesOfDay < LATE_NIGHT_END_MINUTES) return { weekday: (weekday + 6) % 7, minutes: minutesOfDay + DAY, source };
  return { weekday, minutes: minutesOfDay, source };
}

/** AniList の airingAt（UNIX 秒）を、日本時間の放送枠にする */
export function airSlotFromUnix(seconds: number): AirSlot {
  const jst = new Date((seconds + 9 * 3600) * 1000);
  return toAirSlot(jst.getUTCDay(), jst.getUTCHours() * 60 + jst.getUTCMinutes(), "anilist");
}

export function normAirSlot(v: unknown): AirSlot | null {
  if (typeof v !== "object" || v === null) return null;
  const x = v as { weekday?: unknown; minutes?: unknown; source?: unknown };
  if (typeof x.weekday !== "number" || !Number.isInteger(x.weekday) || x.weekday < 0 || x.weekday > 6) return null;
  if (typeof x.minutes !== "number" || !Number.isInteger(x.minutes) || x.minutes < 0 || x.minutes >= DAY + LATE_NIGHT_END_MINUTES) return null;
  // 0:00〜4:59 のまま入っていたら前日の24時台へ寄せる
  const slot = x.minutes < LATE_NIGHT_END_MINUTES ? toAirSlot(x.weekday, x.minutes, "manual") : { weekday: x.weekday, minutes: x.minutes, source: "manual" as const };
  return { ...slot, source: x.source === "anilist" ? "anilist" : "manual" };
}

/** 「25:30」のような時刻の文字 */
export function formatSlotTime(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 画面用：「土 25:30」 */
export function formatAirSlot(slot: AirSlot): string {
  return `${WEEKDAY_LABEL[slot.weekday]} ${formatSlotTime(slot.minutes)}`;
}

/** 入力欄の「25:30」「1:05」を分にする。読めなければ null。0:00〜4:59 は前日扱いにするかを呼び出し側で決める */
export function parseSlotTime(text: string): number | null {
  const m = /^\s*(\d{1,2})[:：](\d{2})\s*$/.exec(text.normalize("NFKC"));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 28 || (h === 28 && min > 59)) return null;
  return h * 60 + min;
}

/** 放送枠の並び：月曜始まり（月〜日）、同じ曜日は早い時刻から */
export function compareAirSlot(a: AirSlot, b: AirSlot): number {
  const order = (d: number) => (d + 6) % 7;
  return order(a.weekday) - order(b.weekday) || a.minutes - b.minutes;
}
