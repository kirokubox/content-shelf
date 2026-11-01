// 集計：作品数と回数・話数を混同しない（仕様181 §4.5）
import { PROGRESS_KIND } from "./constants.js";
import type { DataSet, Log, Medium } from "./types.js";
import { MEDIA } from "./types.js";

export type Period = "month" | "year" | "all";

export function periodRange(period: Period, today: string): { from: string; to: string } {
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
    // 年だけの記録は今月の集計に入れない（1月1日として持っているため）
    if (period === "month" && l.datePrecision === "year") continue;
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
