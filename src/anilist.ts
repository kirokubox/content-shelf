// AniList（APIキー不要）から、アニメ・マンガの作品情報を取る（段階4。仕様181 §5.2）。
// 取るのは「題名・表紙・全話数/全巻数・完結か・次に放送する話」だけ。自分の視聴位置は勝手に進めない。
import { addCour } from "./courLogic.js";
import { airSlotFromUnix } from "./airSlot.js";
import type { Cour, FuzzyDate, Season, Work, WorkState } from "./types.js";

const ENDPOINT = "https://graphql.anilist.co";

export type AnilistType = "ANIME" | "MANGA";

export interface AnilistMedia {
  id: number;
  type: AnilistType;
  title: string;
  romaji: string;
  /** FINISHED / RELEASING / NOT_YET_RELEASED / CANCELLED / HIATUS */
  status: string | null;
  format: string | null;
  episodes: number | null;
  volumes: number | null;
  cover: string | null;
  /** 次に放送する話（放送中のアニメだけ） */
  nextEpisode: number | null;
  /** 次の話の放送日時（UNIX 秒。放送中のアニメだけ。v0.20.0） */
  nextAiringAt: number | null;
  season: string | null;
  seasonYear: number | null;
  startDate: string | null;
  /** 終わった日（連載・放送の終了。日・月だけ・年だけ。v1.0.0） */
  endDate: FuzzyDate | null;
  /** 作者（マンガの原作・作画。日本語の名前があればそれ。v1.0.0） */
  authors: string[];
}

interface RawMedia {
  id?: unknown;
  type?: unknown;
  title?: { native?: unknown; romaji?: unknown };
  status?: unknown;
  format?: unknown;
  episodes?: unknown;
  volumes?: unknown;
  coverImage?: { large?: unknown; medium?: unknown };
  nextAiringEpisode?: { episode?: unknown; airingAt?: unknown } | null;
  season?: unknown;
  seasonYear?: unknown;
  startDate?: { year?: unknown; month?: unknown; day?: unknown };
  endDate?: { year?: unknown; month?: unknown; day?: unknown };
  staff?: { edges?: Array<{ role?: unknown; node?: { name?: { native?: unknown; full?: unknown } } }> };
}

const FIELDS = "id type title { native romaji } status(version: 2) format episodes volumes coverImage { large medium } nextAiringEpisode { episode airingAt } season seasonYear startDate { year month day } endDate { year month day } staff(perPage: 6, sort: RELEVANCE) { edges { role node { name { native full } } } }";

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}
function posInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

export function mapMedia(m: RawMedia): AnilistMedia | null {
  if (typeof m.id !== "number") return null;
  const native = str(m.title?.native);
  const romaji = str(m.title?.romaji);
  const title = native ?? romaji;
  if (!title) return null;
  const sd = m.startDate;
  const startDate = sd && typeof sd.year === "number" && typeof sd.month === "number" && typeof sd.day === "number"
    ? `${sd.year}-${String(sd.month).padStart(2, "0")}-${String(sd.day).padStart(2, "0")}`
    : null;
  return {
    id: m.id,
    type: m.type === "MANGA" ? "MANGA" : "ANIME",
    title,
    romaji: romaji ?? "",
    status: str(m.status),
    format: str(m.format),
    episodes: posInt(m.episodes),
    volumes: posInt(m.volumes),
    cover: str(m.coverImage?.large) ?? str(m.coverImage?.medium),
    nextEpisode: posInt(m.nextAiringEpisode?.episode),
    nextAiringAt: posInt(m.nextAiringEpisode?.airingAt),
    season: str(m.season),
    seasonYear: posInt(m.seasonYear),
    startDate,
    endDate: fuzzyOf(m.endDate),
    authors: authorsOf(m.staff),
  };
}

/** AniList の日付（年だけ・年月だけもある）を、日付と細かさにする */
export function fuzzyOf(d: RawMedia["endDate"]): FuzzyDate | null {
  const y = posInt(d?.year);
  if (!y) return null;
  const m = posInt(d?.month);
  const day = posInt(d?.day);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (m && day) return { date: `${y}-${pad(m)}-${pad(day)}`, precision: "day" };
  if (m) return { date: `${y}-${pad(m)}-01`, precision: "month" };
  return { date: `${y}-01-01`, precision: "year" };
}

/** 作者：役割が原作・作画（Story・Art・Original Creator）の人。日本語の名前を優先し、重ねない（最大2人） */
export function authorsOf(staff: RawMedia["staff"]): string[] {
  const out: string[] = [];
  for (const e of staff?.edges ?? []) {
    const role = str(e.role) ?? "";
    if (!/Story|Art|Original Creator/i.test(role)) continue;
    const name = str(e.node?.name?.native) ?? str(e.node?.name?.full);
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= 2) break;
  }
  return out;
}

async function query(body: { query: string; variables: Record<string, unknown> }, signal?: AbortSignal): Promise<RawMedia[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(res.status === 429 ? "AniListが混んでいます。少し待ってからもう一度" : `AniListに接続できませんでした（${res.status}）`);
  const json = (await res.json()) as { data?: { Page?: { media?: RawMedia[] } } };
  return json.data?.Page?.media ?? [];
}

/** 題名で探す（主題歌・PVなどは外す） */
export async function searchAnilist(term: string, type: AnilistType, signal?: AbortSignal): Promise<AnilistMedia[]> {
  const media = await query({
    query: `query ($search: String, $type: MediaType) { Page(perPage: 8) { media(search: $search, type: $type, isAdult: false) { ${FIELDS} } } }`,
    variables: { search: term, type },
  }, signal);
  return media.map(mapMedia).filter((m): m is AnilistMedia => m !== null && m.format !== "MUSIC" && m.format !== "MUSIC_VIDEO");
}

export async function fetchAnilistByIds(ids: number[]): Promise<AnilistMedia[]> {
  const out: AnilistMedia[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const media = await query({
      query: `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ${FIELDS} } } }`,
      variables: { ids: ids.slice(i, i + 50) },
    });
    out.push(...media.map(mapMedia).filter((m): m is AnilistMedia => m !== null));
  }
  return out;
}

/** 放送済みの話数（AniListの分かる範囲）。放送中なら「次の話−1」、完結なら全話数 */
export function airedFromAnilist(m: AnilistMedia): number | null {
  if (m.type !== "ANIME") return null;
  if (m.nextEpisode !== null) return m.nextEpisode - 1;
  if (m.status === "FINISHED") return m.episodes;
  return null;
}

export function seasonLabelOf(m: AnilistMedia): string {
  const name: Record<string, string> = { WINTER: "冬", SPRING: "春", SUMMER: "夏", FALL: "秋" };
  return m.season && m.seasonYear ? `${m.seasonYear}年${name[m.season] ?? ""}` : "";
}

/** AniListの時期を、クール（本放送）にする。アニメだけ。時期が無ければ null */
export function courOf(m: AnilistMedia): Cour | null {
  if (m.type !== "ANIME" || !m.season || !m.seasonYear) return null;
  const map: Record<string, Season> = { WINTER: "winter", SPRING: "spring", SUMMER: "summer", FALL: "fall" };
  const season = map[m.season];
  return season ? { year: m.seasonYear, season, kind: "original" } : null;
}

/** AniListの状態を作品の状態にする。分からないもの（中止など）は今のまま */
export function workStateOf(m: AnilistMedia, current: WorkState): WorkState {
  if (m.status === "FINISHED") return "finished";
  if (m.status === "RELEASING" || m.status === "HIATUS") return "ongoing";
  if (m.status === "NOT_YET_RELEASED") return "upcoming";
  return current;
}

/**
 * 外部の情報を作品へ反映する。変えるのは「表紙・全話数/全巻数・作品の状態・本放送のクール・（放送日で数えていないアニメの）放送済み話数・放送枠（自動で入れたものだけ）」だけ。
 * クールは、本放送のクールがまだ1つも付いていないときだけ足す（本人が直したクールを戻さない）。
 * 見た位置（progress・readThrough）と状態は触らない（状態の自動切り替えは呼び出し側で withAutoStatus）。
 */
export function applyAnilist(work: Work, m: AnilistMedia, checkedAt: string): Work {
  const total = m.type === "ANIME" ? m.episodes : m.volumes;
  const cour = courOf(m);
  const next: Work = {
    ...work,
    coverUrl: m.cover ?? work.coverUrl,
    total: total ?? work.total,
    workState: workStateOf(m, work.workState),
    cours: cour && !work.cours.some((c) => c.kind === "original") ? addCour(work.cours, cour) : work.cours,
    externalIds: { ...work.externalIds, anilist: m.id },
    infoCheckedAt: checkedAt,
  };
  // 放送枠：次の話の放送日時から曜日・時刻を入れる。手で直した枠は変えない（v0.20.0）
  if (m.type === "ANIME" && m.nextAiringAt !== null && (work.airSlot === null || work.airSlot.source === "anilist")) {
    next.airSlot = airSlotFromUnix(m.nextAiringAt);
  }
  if (m.type === "ANIME" && !work.schedule) {
    const aired = airedFromAnilist(m);
    if (aired !== null) next.latestKnown = aired;
  }
  return next;
}

/**
 * AniListの題名を「題名」と「期・編」に分ける（v1.1.0。本人 2026-11-25「題名やシーズンや期などを自動入力したい」「期を題名から分ける」）。
 * 末尾の「第2期」「第二期」「第3シーズン」「Season 2」「2nd Season」「Part 2」「◯◯編」を期として外す。分けられなければ期は空。
 */
export function splitPartLabel(title: string): { title: string; part: string } {
  const t = title.trim();
  const patterns = [
    /^(.+?)[\s　]*[（(]?(第[0-9０-９一二三四五六七八九十]+(?:期|シーズン|部|クール|章))[）)]?$/,
    /^(.+?)[\s　]+((?:Season|SEASON|season)\s*[0-9]+)$/,
    /^(.+?)[\s　]+([0-9]+(?:st|nd|rd|th)\s+(?:Season|SEASON|season))$/,
    /^(.+?)[\s　]+((?:Part|PART|part)\s*[0-9]+)$/,
    /^(.+?)[\s　]+(\S+編)$/,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m && m[1].trim()) return { title: m[1].trim(), part: m[2].trim() };
  }
  return { title: t, part: "" };
}
