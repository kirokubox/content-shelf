import { nowIso } from "./dateUtils.js";
import type { Base, Log, Medium, Work } from "./types.js";

/** UUID。http のLAN接続など randomUUID が無い環境では代替する */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newBase(now: string = nowIso()): Base {
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null };
}

export function emptyWork(medium: Medium, now: string = nowIso()): Work {
  return {
    ...newBase(now),
    medium,
    title: "",
    kana: "",
    seasonLabel: "",
    franchiseId: null,
    // 映画・小説などの単発ものは「見た・読んだ」を既定にする（続きを数えないため）
    status: medium === "movie" || medium === "novel" || medium === "live" || medium === "video" || medium === "other" ? "done" : "active",
    finished: null,
    total: null,
    latestKnown: null,
    schedule: null,
    progress: null,
    readThrough: null,
    owned: medium === "manga" ? { known: false, ranges: [], medium: null, place: null } : null,
    edition: "",
    externalIds: {},
    coverUrl: null,
    memo: "",
    legacyNote: "",
    completedAt: null,
    touchedAt: now,
    personIds: [],
    setlist: "",
    infoCheckedAt: null,
    buying: false,
    videoOwned: null,
  };
}

export function newLog(fields: Pick<Log, "workId" | "kind" | "date"> & Partial<Log>, now: string = nowIso()): Log {
  return {
    ...newBase(now),
    position: null,
    issueDate: null,
    note: "",
    rating: null,
    place: "",
    source: "",
    ...fields,
  };
}

export function activeOnly<T extends Base>(records: T[]): T[] {
  return records.filter((r) => r.deletedAt === null);
}
