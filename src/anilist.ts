// AniList（APIキー不要）から、アニメ・マンガの作品情報を取る（段階4。仕様181 §5.2）。
// 取るのは「題名・表紙・全話数/全巻数・完結か・次に放送する話」だけ。自分の視聴位置は勝手に進めない。
import type { Work } from "./types.js";

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
  season: string | null;
  seasonYear: number | null;
  startDate: string | null;
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
  nextAiringEpisode?: { episode?: unknown } | null;
  season?: unknown;
  seasonYear?: unknown;
  startDate?: { year?: unknown; month?: unknown; day?: unknown };
}

const FIELDS = "id type title { native romaji } status(version: 2) format episodes volumes coverImage { large medium } nextAiringEpisode { episode } season seasonYear startDate { year month day }";

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
    season: str(m.season),
    seasonYear: posInt(m.seasonYear),
    startDate,
  };
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

/**
 * 外部の情報を作品へ反映する。変えるのは「表紙・全話数/全巻数・完結か・（放送日で数えていないアニメの）放送済み話数」だけ。
 * 見た位置（progress・readThrough）と状態は触らない（状態の自動切り替えは呼び出し側で withAutoStatus）。
 */
export function applyAnilist(work: Work, m: AnilistMedia, checkedAt: string): Work {
  const total = m.type === "ANIME" ? m.episodes : m.volumes;
  const finished = m.status === "FINISHED" ? true : m.status === "RELEASING" || m.status === "HIATUS" || m.status === "NOT_YET_RELEASED" ? false : work.finished;
  const next: Work = {
    ...work,
    coverUrl: m.cover ?? work.coverUrl,
    total: total ?? work.total,
    finished,
    externalIds: { ...work.externalIds, anilist: m.id },
    infoCheckedAt: checkedAt,
  };
  if (m.type === "ANIME" && !work.schedule) {
    const aired = airedFromAnilist(m);
    if (aired !== null) next.latestKnown = aired;
  }
  return next;
}
