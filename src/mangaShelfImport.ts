// マンガ棚のバックアップ（manga-shelf-backup-*.json、version 2）をコンテンツ棚の作品へ変換する（仕様181 §6.2）。
// マンガ棚には「いつ読んだか」が無いので、記録（Log）は作らない（日付を創作しない）。
import type { OwnedMedium, PaperPlace, VolumeRange, Work } from "./types.js";

interface MangaSeries {
  id: string;
  title: string;
  kana?: string;
  editionLabel?: string | null;
  publicationStatus?: "ongoing" | "completed" | "unknown";
  totalVolumes?: number | null;
  readProgressKnown?: boolean;
  readUpTo?: number | null;
  finishedAt?: string | null;
  everCompleted?: boolean;
  ownershipKnown?: boolean;
  ownedMedium?: OwnedMedium;
  paperLocation?: PaperPlace;
  ownedRanges?: VolumeRange[];
  planned?: boolean;
  anilistId?: number | null;
  legacyNote?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type MangaParse = { ok: true; works: Work[] } | { ok: false; error: string };

/** マンガ棚のid から決まる、コンテンツ棚側のid（何度取り込んでも同じ作品になる） */
export function mangaShelfWorkId(seriesId: string): string {
  return `manga-shelf:${seriesId}`;
}

function posInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

export function convertMangaSeries(s: MangaSeries, now: string): Work {
  const finished = s.publicationStatus === "completed" ? true : s.publicationStatus === "ongoing" ? false : null;
  const total = posInt(s.totalVolumes);
  const progress = s.readProgressKnown === false ? null : posInt(s.readUpTo);
  const allRead = finished === true && total !== null && progress !== null && progress >= total;
  const status = s.planned && !progress ? "wish" : allRead ? "done" : "active";
  const created = s.createdAt ?? now;
  const updated = s.updatedAt ?? now;
  return {
    id: mangaShelfWorkId(s.id),
    createdAt: created,
    updatedAt: updated,
    deletedAt: null,
    medium: "manga",
    title: s.title,
    kana: s.kana ?? "",
    seasonLabel: "",
    franchiseId: null,
    status,
    finished,
    total,
    latestKnown: null,
    schedule: null,
    progress,
    readThrough: null,
    owned: {
      known: s.ownershipKnown ?? false,
      ranges: Array.isArray(s.ownedRanges) ? s.ownedRanges.map((r) => ({ from: r.from, to: r.to })) : [],
      medium: s.ownedMedium ?? null,
      place: s.paperLocation ?? null,
    },
    edition: s.editionLabel ?? "",
    externalIds: { ...(s.anilistId ? { anilist: s.anilistId } : {}), mangaShelf: s.id },
    coverUrl: null,
    memo: s.memo ?? "",
    legacyNote: s.legacyNote ?? "",
    completedAt: status === "done" ? s.finishedAt ?? updated : null,
    touchedAt: updated,
    personIds: [],
    setlist: "",
    infoCheckedAt: null,
    buying: false,
    videoOwned: null,
    platform: "",
    clearLevel: null,
    ownFormat: null,
    isOriginal: false,
    shelfPlace: null,
  };
}

export function parseMangaShelfBackup(text: string, now: string): MangaParse {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "ファイルを読めませんでした" };
  }
  const obj = json as { version?: unknown; series?: unknown };
  if (typeof obj !== "object" || obj === null || !Array.isArray(obj.series)) return { ok: false, error: "マンガ棚のバックアップではありません" };
  const series = obj.series as MangaSeries[];
  const bad = series.findIndex((s) => typeof s?.id !== "string" || typeof s?.title !== "string" || s.title.trim() === "");
  if (bad >= 0) return { ok: false, error: `${bad + 1}件目の形が正しくありません` };
  return { ok: true, works: series.map((s) => convertMangaSeries(s, now)) };
}
