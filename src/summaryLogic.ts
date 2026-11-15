// 集計：作品数と回数・話数を混同しない（仕様181 §4.5）
import { PROGRESS_KIND } from "./constants.js";
import { exportRange } from "./exportRange.js";
import type { DataSet, Log, Medium } from "./types.js";
import { MEDIA } from "./types.js";

export type Period = "week" | "month" | "year" | "all";

export function periodRange(period: Period, today: string): { from: string; to: string } {
  if (period === "week") {
    const { from, to } = exportRange("week", today, 0);
    return { from, to };
  }
  if (period === "month") return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-31` };
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  return { from: "0000-01-01", to: "9999-12-31" };
}

export interface MediumSummary {
  medium: Medium;
  /** 記録がある作品の数 */
  works: number;
  /** 記録の回数（話・巻・号・鑑賞の合計） */
  count: number;
}

function liveLogs(data: DataSet): { logs: Log[]; mediumOf: Map<string, Medium> } {
  const mediumOf = new Map<string, Medium>();
  for (const w of data.works) if (w.deletedAt === null) mediumOf.set(w.id, w.medium);
  return { logs: data.logs.filter((l) => l.deletedAt === null && mediumOf.has(l.workId)), mediumOf };
}

export function summarize(data: DataSet, period: Period, today: string): MediumSummary[] {
  const { from, to } = periodRange(period, today);
  const { logs, mediumOf } = liveLogs(data);
  const map = new Map<Medium, { works: Set<string>; count: number }>();
  for (const l of logs) {
    if (l.date < from || l.date > to) continue;
    // 年だけの記録は月・週の集計に入れない（1月1日として持っているため）
    if ((period === "month" || period === "week") && l.datePrecision === "year") continue;
    // 月だけの記録も、特定の1週間には割り当てない（週次書き出しと同じ）
    if (period === "week" && l.datePrecision === "month") continue;
    const m = mediumOf.get(l.workId)!;
    const cur = map.get(m) ?? { works: new Set<string>(), count: 0 };
    cur.works.add(l.workId);
    cur.count += 1;
    map.set(m, cur);
  }
  return MEDIA.filter((m) => map.has(m)).map((m) => ({ medium: m, works: map.get(m)!.works.size, count: map.get(m)!.count }));
}

/** 回数の単位（アニメ＝話、マンガ＝巻、週刊誌＝号、映画＝回） */
export function countUnit(medium: Medium): string {
  if (medium === "novel") return "冊";
  const kind = PROGRESS_KIND[medium];
  if (kind === "episode") return "話";
  if (kind === "volume") return "巻";
  if (kind === "issue") return "号";
  return "回";
}

/** 今年の月ごとの記録数（1〜12月） */
export function monthlyCounts(data: DataSet, year: string): number[] {
  const out = Array.from({ length: 12 }, () => 0);
  const { logs } = liveLogs(data);
  for (const l of logs) {
    if (l.date.slice(0, 4) !== year || l.datePrecision === "year") continue;
    out[Number(l.date.slice(5, 7)) - 1] += 1;
  }
  return out;
}

/** 記録へ移った作品の数（期間内） */
export function completedWorks(data: DataSet, period: Period, today: string): number {
  const { from, to } = periodRange(period, today);
  return data.works.filter((w) => w.deletedAt === null && w.status === "done" && w.completedAt !== null && w.completedAt.slice(0, 10) >= from && w.completedAt.slice(0, 10) <= to).length;
}

// ---------- 月のまとめ（v0.15.0） ----------

export interface MonthWork {
  workId: string;
  medium: Medium;
  /** その月の記録の数 */
  count: number;
  /** その月の記録のうち、いちばん高い星（無ければ null） */
  rating: number | null;
  /** その月で最初に記録した日 */
  firstDate: string;
}

export interface MonthSummary {
  /** YYYY-MM */
  month: string;
  /** その月に記録がある作品（最初に記録した日の順） */
  works: MonthWork[];
  byMedium: MediumSummary[];
  totalLogs: number;
  /** その月に最後まで見た・読んだ作品の数 */
  completed: number;
  /** 星が4以上の作品（星の高い順、同じなら記録した日の順。最大6） */
  topRated: MonthWork[];
}

export const TOP_RATED_MIN = 4;
export const TOP_RATED_LIMIT = 6;

/** 月のまとめ。年だけの記録は月に割り当てない（集計タブの「今月」と同じ） */
export function monthSummary(data: DataSet, month: string): MonthSummary {
  const { logs, mediumOf } = liveLogs(data);
  const map = new Map<string, MonthWork>();
  let totalLogs = 0;
  for (const l of logs) {
    if (l.date.slice(0, 7) !== month || l.datePrecision === "year") continue;
    totalLogs += 1;
    const cur = map.get(l.workId);
    if (!cur) {
      map.set(l.workId, { workId: l.workId, medium: mediumOf.get(l.workId)!, count: 1, rating: l.rating, firstDate: l.date });
      continue;
    }
    cur.count += 1;
    if (l.rating !== null && (cur.rating === null || l.rating > cur.rating)) cur.rating = l.rating;
    if (l.date < cur.firstDate) cur.firstDate = l.date;
  }
  const works = [...map.values()].sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.workId.localeCompare(b.workId));
  const byMedium = MEDIA.map((m) => {
    const list = works.filter((w) => w.medium === m);
    return { medium: m, works: list.length, count: list.reduce((sum, w) => sum + w.count, 0) };
  }).filter((row) => row.works > 0);
  const completed = data.works.filter((w) => w.deletedAt === null && w.status === "done" && w.completedAt !== null && w.completedAt.slice(0, 7) === month).length;
  const topRated = works
    .filter((w) => w.rating !== null && w.rating >= TOP_RATED_MIN)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.firstDate.localeCompare(b.firstDate))
    .slice(0, TOP_RATED_LIMIT);
  return { month, works, byMedium, totalLogs, completed, topRated };
}

/** 月を n か月ずらす（YYYY-MM） */
export function shiftMonth(month: string, n: number): string {
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + n;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String(index - year * 12 + 1).padStart(2, "0")}`;
}

/** 月の表示（例：2026年11月） */
export function monthLabel(month: string): string {
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
}
