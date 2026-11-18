import { LOG_VIAS, PURCHASE_FORMATS, PURCHASE_STAGES, SEASONS, WORK_STATES } from "./types.js";
import type { Cour, DataSet, Log, VolumeRange, Work } from "./types.js";

/** 変更分（id で上書き・追加）を全体へ反映した新しいデータ */
export function applyChanges(data: DataSet, changes: Partial<DataSet>): DataSet {
  const merge = <T extends { id: string }>(cur: T[], inc: T[] | undefined): T[] => {
    if (!inc || inc.length === 0) return cur;
    const map = new Map(cur.map((r) => [r.id, r]));
    for (const r of inc) map.set(r.id, r);
    return Array.from(map.values());
  };
  return {
    franchises: merge(data.franchises, changes.franchises),
    works: merge(data.works, changes.works),
    logs: merge(data.logs, changes.logs),
    people: merge(data.people, changes.people),
  };
}

export const EMPTY_DATA: DataSet = { franchises: [], works: [], logs: [], people: [] };

const PLACES = ["home", "parents_home", "both", "unknown"] as const;

function normRanges(v: unknown): VolumeRange[] {
  if (!Array.isArray(v)) return [];
  const out: VolumeRange[] = [];
  for (const r of v as { from?: unknown; to?: unknown; medium?: unknown }[]) {
    if (typeof r?.from !== "number" || typeof r?.to !== "number") continue;
    out.push({ from: r.from, to: r.to, medium: r.medium === "paper" || r.medium === "kindle" ? r.medium : null });
  }
  return out;
}

function normCours(v: unknown): Cour[] {
  if (!Array.isArray(v)) return [];
  const out: Cour[] = [];
  for (const c of v as { year?: unknown; season?: unknown; kind?: unknown }[]) {
    const season = SEASONS.find((s) => s === c?.season);
    if (typeof c?.year !== "number" || !Number.isInteger(c.year) || !season) continue;
    out.push({ year: c.year, season, kind: c.kind === "rerun" ? "rerun" : "original" });
  }
  return out;
}

/** 版2の作品に、足りない項目を補う（版1の作品は先に migrate.ts で移し替える） */
export function normalizeWork(w: Work): Work {
  const x = w as unknown as Record<string, unknown>;
  const purchase = (x.purchase ?? {}) as { stage?: unknown; format?: unknown };
  const owned = w.owned as unknown as { known?: unknown; ranges?: unknown; reserved?: unknown; place?: unknown } | null;
  return {
    ...w,
    partLabel: typeof w.partLabel === "string" ? w.partLabel : "",
    cours: normCours(w.cours),
    rounds: typeof w.rounds === "number" && Number.isInteger(w.rounds) && w.rounds >= 1 ? w.rounds : 1,
    workState: WORK_STATES.find((s) => s === w.workState) ?? null,
    edition: typeof w.edition === "string" ? w.edition : "",
    purchase: {
      stage: PURCHASE_STAGES.find((s) => s === purchase.stage) ?? "none",
      format: PURCHASE_FORMATS.find((f) => f === purchase.format) ?? null,
    },
    access: w.access === "jump_plus" || w.access === "streaming" ? w.access : null,
    owned: owned && typeof owned === "object"
      ? { known: owned.known === true, ranges: normRanges(owned.ranges), reserved: normRanges(owned.reserved), place: PLACES.find((p) => p === owned.place) ?? null }
      : null,
    personIds: Array.isArray(w.personIds) ? w.personIds : [],
    setlist: typeof w.setlist === "string" ? w.setlist : "",
    infoCheckedAt: typeof w.infoCheckedAt === "string" ? w.infoCheckedAt : null,
    buying: w.buying === true,
    platform: typeof w.platform === "string" ? w.platform : "",
    clearLevel: w.clearLevel === "clear" || w.clearLevel === "complete" || w.clearLevel === "partway" ? w.clearLevel : null,
    isOriginal: w.isOriginal === true,
    shelfPlace: w.shelfPlace === "home" || w.shelfPlace === "parents_home" || w.shelfPlace === "both" ? w.shelfPlace : null,
    eventKind: w.medium === "live" ? ((["live", "fes", "food", "exhibit", "other"] as const).find((k) => k === w.eventKind) ?? null) : null,
    coverPhotoId: typeof w.coverPhotoId === "string" && w.coverPhotoId ? w.coverPhotoId : null,
  };
}

/** 記録に、足りない項目（視聴手段）を補う */
export function normalizeLog(l: Log): Log {
  return { ...l, via: LOG_VIAS.find((v) => v === l.via) ?? null, place: typeof l.place === "string" ? l.place : "", source: typeof l.source === "string" ? l.source : "" };
}

export function normalizeData(d: Partial<DataSet>): DataSet {
  return { franchises: d.franchises ?? [], works: (d.works ?? []).map(normalizeWork), logs: (d.logs ?? []).map(normalizeLog), people: d.people ?? [] };
}
