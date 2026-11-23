// クール（放送の時期）と視聴手段の計算。外部情報なしで動く純粋ロジック（v0.16.0）
import { LOG_VIA_LABEL, PROGRESS_KIND } from "./constants.js";
import type { Cour, Log, LogVia, Season, Work } from "./types.js";
import { SEASONS } from "./types.js";

export const SEASON_WORD: Record<Season, string> = { winter: "冬", spring: "春", summer: "夏", fall: "秋" };
const WORD_TO_SEASON: Record<string, Season> = { 冬: "winter", 春: "spring", 夏: "summer", 秋: "fall" };

/** 1〜3月＝冬、4〜6月＝春、7〜9月＝夏、10〜12月＝秋 */
export function seasonOfMonth(month: number): Season {
  if (month <= 3) return "winter";
  if (month <= 6) return "spring";
  if (month <= 9) return "summer";
  return "fall";
}

/** 日付キー（YYYY-MM-DD）から、その日の年・季節 */
export function courPeriodOf(dateKey: string): { year: number; season: Season } {
  return { year: Number(dateKey.slice(0, 4)), season: seasonOfMonth(Number(dateKey.slice(5, 7))) };
}

/** 「2025年夏」（再放送は「再放送 2026年秋」） */
export function formatCour(c: Cour): string {
  const base = `${c.year}年${SEASON_WORD[c.season]}`;
  return c.kind === "rerun" ? `再放送 ${base}` : base;
}

/** 今期の名前（例：2026年秋） */
export function currentCourName(today: string): string {
  const p = courPeriodOf(today);
  return `${p.year}年${SEASON_WORD[p.season]}`;
}

export function isSameCour(a: Cour, b: Cour): boolean {
  return a.year === b.year && a.season === b.season && a.kind === b.kind;
}

/** 作品に、この年・季節のクールが付いているか（kind を渡すとそれだけ） */
export function hasCourIn(work: Pick<Work, "cours">, period: { year: number; season: Season }, kind?: Cour["kind"]): boolean {
  return work.cours.some((c) => c.year === period.year && c.season === period.season && (kind === undefined || c.kind === kind));
}

/** 今期のクールが付いているか */
export function inCurrentCour(work: Pick<Work, "cours">, today: string): boolean {
  return hasCourIn(work, courPeriodOf(today));
}

/** 「今期の再放送を足す」で足すクール */
export function currentRerun(today: string): Cour {
  return { ...courPeriodOf(today), kind: "rerun" };
}

/** 今期の再放送がまだ付いていないか（付いていればボタンを出さない） */
export function canAddCurrentRerun(work: Pick<Work, "cours">, today: string): boolean {
  return !hasCourIn(work, courPeriodOf(today), "rerun");
}

/** 同じクールを重ねずに足す（並びは年・季節順） */
export function addCour(cours: Cour[], c: Cour): Cour[] {
  if (cours.some((x) => isSameCour(x, c))) return cours;
  return [...cours, c].sort(compareCour);
}

export function compareCour(a: Cour, b: Cour): number {
  return a.year - b.year || SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season) || (a.kind === b.kind ? 0 : a.kind === "original" ? -1 : 1);
}

/** 「2026年秋」とぴったり同じ形だけクールにする。それ以外は null */
export function parseSeasonLabel(label: string): Cour | null {
  const m = label.match(/^(\d{4})年(春|夏|秋|冬)$/);
  if (!m) return null;
  return { year: Number(m[1]), season: WORD_TO_SEASON[m[2]], kind: "original" };
}

/** 題名の横に出す小さい名前（期・編・巻 ＋ アニメ・ドラマならクール）。無ければ空 */
export function subLabel(work: Pick<Work, "medium" | "partLabel" | "cours">): string {
  const parts: string[] = [];
  if (work.partLabel) parts.push(work.partLabel);
  if ((work.medium === "anime" || work.medium === "drama") && work.cours.length > 0) parts.push(work.cours.map(formatCour).join("・"));
  return parts.join("　");
}

/** 検索の対象にする文字（期・編・巻とクールの文字の両方） */
export function courSearchText(work: Pick<Work, "partLabel" | "cours">): string {
  return [work.partLabel, ...work.cours.map((c) => `${c.year}年${SEASON_WORD[c.season]} ${c.year}${SEASON_WORD[c.season]} ${c.kind === "rerun" ? "再放送" : "本放送"}`)].join(" ");
}

/** 作品ごとの、一番新しい記録の視聴手段（記録が無い・手段が無い作品は null） */
export function latestViaMap(logs: readonly Log[]): Map<string, LogVia | null> {
  const latest = new Map<string, Log>();
  for (const l of logs) {
    if (l.deletedAt !== null) continue;
    const cur = latest.get(l.workId);
    if (!cur || l.date > cur.date || (l.date === cur.date && l.createdAt > cur.createdAt)) latest.set(l.workId, l);
  }
  return new Map(Array.from(latest, ([id, l]) => [id, l.via ?? null]));
}

/** 記録の視聴手段の既定値：前回の記録の手段 → 種類ごとの既定 */
export function defaultVia(work: Pick<Work, "id" | "medium" | "cours"> & Partial<Pick<Work, "access" | "purchase">>, logs: readonly Log[], today: string): LogVia | null {
  let prev: Log | null = null;
  for (const l of logs) {
    if (l.deletedAt !== null || l.workId !== work.id || !l.via) continue;
    if (!prev || l.date > prev.date || (l.date === prev.date && l.createdAt > prev.createdAt)) prev = l;
  }
  if (prev?.via) return prev.via;
  if (work.medium === "anime" || work.medium === "drama") {
    const p = courPeriodOf(today);
    return hasCourIn(work, p, "rerun") && !hasCourIn(work, p, "original") ? "rerun" : "broadcast";
  }
  if (work.medium === "movie" || work.medium === "live") return "venue";
  if (work.medium === "video") return "disc";
  if (work.medium === "manga") return mangaViaFromWork(work);
  return null;
}

/** マンガの記録の読む手段の既定：作品の読む手段 → 持っていれば「所持」（v1.0.0） */
export function mangaViaFromWork(work: Partial<Pick<Work, "access" | "purchase">>): LogVia | null {
  if (work.access === "weekly") return "weekly";
  if (work.access === "manga_cafe") return "manga_cafe";
  if (work.access === "rental") return "rental";
  return work.purchase?.stage === "owned" ? "own_book" : null;
}

export interface CourWork {
  work: Work;
  rerun: boolean;
}

/**
 * 今期の一覧：今期のクールが付いた作品のうち、進行中か予定のもの（済は別に返す）。
 * 最新の記録の視聴手段が配信の作品は外す（記録が無ければ放送として扱う）
 */
export function currentCourList(works: readonly Work[], logs: readonly Log[], today: string): { active: CourWork[]; done: CourWork[] } {
  const via = latestViaMap(logs);
  const period = courPeriodOf(today);
  const active: CourWork[] = [];
  const done: CourWork[] = [];
  for (const w of works) {
    if (w.deletedAt !== null || !hasCourIn(w, period)) continue;
    if (via.get(w.id) === "streaming") continue;
    const rerun = hasCourIn(w, period, "rerun") && !hasCourIn(w, period, "original");
    if (w.status === "done") done.push({ work: w, rerun });
    else if (w.status === "active" || w.status === "wish") active.push({ work: w, rerun });
  }
  const byTitle = (a: CourWork, b: CourWork) => (a.work.kana || a.work.title).localeCompare(b.work.kana || b.work.title, "ja");
  return { active: active.sort(byTitle), done: done.sort(byTitle) };
}

/** 続きを数える種類か（今期の一覧に出すのはアニメ・ドラマが中心。種類は問わず、クールが付いていれば出す） */
export function countsEpisodes(work: Pick<Work, "medium">): boolean {
  return PROGRESS_KIND[work.medium] === "episode";
}

/** 記録の視聴手段と場所の文字（同じ言葉のときは1回だけ）。例：["放送", "テレビ"]、["配信"] */
/** 一行表示用。視聴手段の名前に「・」を含むので、場所は括弧に入れて区切りを見分けやすくする。 */
export function viaPlaceText(log: Pick<Log, "via" | "place">): string {
  const [via, place] = viaPlaceParts(log);
  if (!place) return via ?? "";
  return via ? `${via}（${place}）` : place;
}

export function viaPlaceParts(log: Pick<Log, "via" | "place">): string[] {
  const via = log.via ? LOG_VIA_LABEL[log.via] : "";
  const place = log.place && log.place !== via ? log.place : "";
  return [via, place].filter(Boolean);
}
