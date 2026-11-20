// 楽しみの日（発売日・公開日・開催日・放送開始日）の計算。純粋ロジック（v0.17.0）
import { WEEKDAY_LABEL, expectLabel } from "./constants.js";
import { daysBetween, parseDateKey, toDateKey } from "./dateUtils.js";
import type { FuzzyDate, Medium, Work } from "./types.js";

/**
 * その日付の「いちばん遅い日」。日＝その日、月だけ＝その月の末日、年だけ＝12月31日。
 * 並べるときも過去かどうかも、この日で決める（「12月」は12月20日より後ろ、今日が12月5日でも「12月」は過去にしない）
 */
export function fuzzyEnd(d: FuzzyDate): string {
  if (d.precision === "year") return `${d.date.slice(0, 4)}-12-31`;
  if (d.precision === "month") return toDateKey(new Date(Number(d.date.slice(0, 4)), Number(d.date.slice(5, 7)), 0, 12));
  return d.date;
}

/** 今日より前か（月だけ・年だけは、その月・年が終わってから過去になる） */
export function isPastFuzzy(d: FuzzyDate, today: string): boolean {
  return fuzzyEnd(d) < today;
}

/** 近い順に並べる比べ方。同じ日なら、細かい（日まで分かる）方を先に */
export function compareFuzzy(a: FuzzyDate, b: FuzzyDate): number {
  const order = { day: 0, month: 1, year: 2 } as const;
  return fuzzyEnd(a).localeCompare(fuzzyEnd(b)) || order[a.precision] - order[b.precision] || a.date.localeCompare(b.date);
}

/** 画面用：12月20日（土）／2026年12月／2027年。今年は年を省く */
export function formatFuzzy(d: FuzzyDate, today: string): string {
  const y = d.date.slice(0, 4);
  const sameYear = y === today.slice(0, 4);
  if (d.precision === "year") return `${y}年`;
  const m = Number(d.date.slice(5, 7));
  if (d.precision === "month") return sameYear ? `${m}月` : `${y}年${m}月`;
  const dt = parseDateKey(d.date);
  const base = `${m}月${dt.getDate()}日（${WEEKDAY_LABEL[dt.getDay()]}）`;
  return sameYear ? base : `${y}年${base}`;
}

/** 書き出し用：2026-12-20／2026-12／2027 */
export function fuzzyKey(d: FuzzyDate): string {
  if (d.precision === "year") return d.date.slice(0, 4);
  if (d.precision === "month") return d.date.slice(0, 7);
  return d.date;
}

/**
 * 作品の楽しみの日。アニメ・ドラマで放送予定（毎週の放送日）が入っているときは、その初回の日を使う（同じ意味の項目を二重に持たない）。
 * それ以外は作品の expect
 */
export function workExpect(work: Pick<Work, "medium" | "schedule" | "expect">): FuzzyDate | null {
  if ((work.medium === "anime" || work.medium === "drama") && work.schedule) return { date: work.schedule.firstDate, precision: "day" };
  return work.expect;
}

/** 持っている巻・予約中の巻（数の集まり） */
function volumesOf(ranges: readonly { from: number; to: number }[] | undefined): Set<number> {
  const s = new Set<number>();
  for (const r of ranges ?? []) for (let n = r.from; n <= r.to && n - r.from < 5000; n += 1) s.add(n);
  return s;
}

/**
 * ホームの楽しみの予定に出す「あと何日」（v0.20.0）。
 * 日まで分かる日付：今日／明日／あと10日まで日 → 8週間まで週 → それより先は月（12か月からは年）。
 * 月だけ：今月／来月／あと○か月。年だけ：今年／来年／あと○年
 */
export function countdownText(d: FuzzyDate, today: string): string {
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const y = Number(d.date.slice(0, 4));
  const m = Number(d.date.slice(5, 7));
  if (d.precision === "year") {
    const n = y - ty;
    return n <= 0 ? "今年" : n === 1 ? "来年" : `あと${n}年`;
  }
  if (d.precision === "month") {
    const n = (y - ty) * 12 + (m - tm);
    return n <= 0 ? "今月" : n === 1 ? "来月" : `あと${n}か月`;
  }
  const days = daysBetween(today, d.date);
  if (days <= 0) return "今日";
  if (days === 1) return "明日";
  if (days <= 10) return `あと${days}日`;
  if (days <= 56) return `あと${Math.round(days / 7)}週間`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `あと${months}か月`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `あと${years}年${rest > 0 ? `${rest}か月` : ""}`;
}

export interface UpcomingItem {
  work: Work;
  date: FuzzyDate;
  /** マンガの巻ごとの楽しみの日なら、その巻 */
  volume: number | null;
  /** 発売・公開・開催・放送開始 */
  label: string;
}

/** 楽しみの日の言い方（「発売」「公開」「開催」「放送開始」） */
export function expectVerb(medium: Medium): string {
  return expectLabel(medium).replace(/日$/, "");
}

/**
 * 作品ごとの、今日以降でいちばん近い楽しみの日。無ければ null。
 * マンガは、まだ持っていない巻の巻ごとの楽しみの日も見る（読み終えた作品でも、新刊は楽しみ）。
 * 作品そのものの楽しみの日は、済（見た・読んだ）の作品では使わない
 */
export function nextExpect(work: Work, today: string): UpcomingItem | null {
  const cands: UpcomingItem[] = [];
  const label = expectVerb(work.medium);
  const own = workExpect(work);
  if (own && work.status !== "done" && !isPastFuzzy(own, today)) cands.push({ work, date: own, volume: null, label });
  if (work.medium === "manga" && work.owned) {
    const owned = volumesOf(work.owned.ranges);
    for (const v of work.owned.volumeDates) {
      if (owned.has(v.volume) || isPastFuzzy(v.date, today)) continue;
      cands.push({ work, date: v.date, volume: v.volume, label });
    }
  }
  cands.sort((a, b) => compareFuzzy(a.date, b.date));
  return cands[0] ?? null;
}

/**
 * ホームの「楽しみの予定」：種類ごとに、今日以降でいちばん近いものを1件ずつ。近い順に並べる。
 * 今日より前の日付と、楽しみの日が無いものは出さない
 */
export function upcomingByMedium(works: readonly Work[], today: string): UpcomingItem[] {
  const best = new Map<Medium, UpcomingItem>();
  for (const w of works) {
    if (w.deletedAt !== null) continue;
    const item = nextExpect(w, today);
    if (!item) continue;
    const cur = best.get(w.medium);
    if (!cur || compareFuzzy(item.date, cur.date) < 0) best.set(w.medium, item);
  }
  return Array.from(best.values()).sort((a, b) => compareFuzzy(a.date, b.date));
}
