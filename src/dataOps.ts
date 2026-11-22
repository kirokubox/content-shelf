import { ACCESSES, DIGITAL_STORES, LOG_VIAS, PURCHASE_FORMATS, PURCHASE_STAGES, SEASONS, WORK_STATES } from "./types.js";
import type { Access, Cour, DataSet, DigitalStore, FuzzyDate, Log, Person, VolumeDate, VolumeRange, Work } from "./types.js";
import { isDateKey } from "./dateUtils.js";
import { normAirSlot } from "./airSlot.js";

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

function store(v: unknown): DigitalStore | null {
  return DIGITAL_STORES.find((s) => s === v) ?? null;
}

/** 巻の範囲。v0.16 の kindle は 電子＋Kindle へ（何度通しても同じ結果になる） */
function normRanges(v: unknown): VolumeRange[] {
  if (!Array.isArray(v)) return [];
  const out: VolumeRange[] = [];
  for (const r of v as { from?: unknown; to?: unknown; medium?: unknown; store?: unknown }[]) {
    if (typeof r?.from !== "number" || typeof r?.to !== "number") continue;
    if (r.medium === "kindle") out.push({ from: r.from, to: r.to, medium: "digital", store: "kindle" });
    else if (r.medium === "digital") out.push({ from: r.from, to: r.to, medium: "digital", store: store(r.store) });
    else out.push({ from: r.from, to: r.to, medium: r.medium === "paper" ? "paper" : null, store: null });
  }
  return out;
}

export function normFuzzyDate(v: unknown): FuzzyDate | null {
  const x = v as { date?: unknown; precision?: unknown } | null;
  if (!x || typeof x !== "object" || !isDateKey(x.date)) return null;
  const precision = x.precision === "month" || x.precision === "year" ? x.precision : "day";
  return { date: x.date, precision };
}

function normVolumeDates(v: unknown): VolumeDate[] {
  if (!Array.isArray(v)) return [];
  const out: VolumeDate[] = [];
  for (const x of v as { volume?: unknown; date?: unknown }[]) {
    const date = normFuzzyDate(x?.date);
    if (typeof x?.volume !== "number" || !Number.isInteger(x.volume) || x.volume < 1 || !date) continue;
    if (out.some((o) => o.volume === x.volume)) continue;
    out.push({ volume: x.volume, date });
  }
  return out.sort((a, b) => a.volume - b.volume);
}

/** 読む手段。v0.16 の jump_plus は 電子＋ジャンプ＋ へ */
function normAccess(access: unknown, accessStore: unknown): { access: Access; accessStore: DigitalStore | null } {
  if (access === "jump_plus") return { access: "digital", accessStore: "jump_plus" };
  const a = ACCESSES.find((x) => x === access) ?? null;
  return { access: a, accessStore: a === "digital" ? store(accessStore) : null };
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
  const purchase = (x.purchase ?? {}) as { stage?: unknown; format?: unknown; store?: unknown };
  const owned = w.owned as unknown as { known?: unknown; ranges?: unknown; reserved?: unknown; place?: unknown; volumeDates?: unknown } | null;
  // v0.16 の kindle は 電子＋Kindle
  const legacyKindle = purchase.format === "kindle";
  const format = legacyKindle ? "digital" : PURCHASE_FORMATS.find((f) => f === purchase.format) ?? null;
  const acc = normAccess(x.access, x.accessStore);
  return {
    ...w,
    partLabel: typeof w.partLabel === "string" ? w.partLabel : "",
    cours: normCours(w.cours),
    rounds: typeof w.rounds === "number" && Number.isInteger(w.rounds) && w.rounds >= 1 ? w.rounds : 1,
    workState: WORK_STATES.find((s) => s === w.workState) ?? null,
    edition: typeof w.edition === "string" ? w.edition : "",
    purchase: {
      stage: PURCHASE_STAGES.find((s) => s === purchase.stage) ?? "none",
      format,
      store: legacyKindle ? "kindle" : format === "digital" ? store(purchase.store) : null,
    },
    access: acc.access,
    accessStore: acc.accessStore,
    expect: normFuzzyDate(x.expect),
    homePick: x.homePick === true,
    owned: owned && typeof owned === "object"
      ? { known: owned.known === true, ranges: normRanges(owned.ranges), reserved: normRanges(owned.reserved), place: PLACES.find((p) => p === owned.place) ?? null, volumeDates: normVolumeDates(owned.volumeDates) }
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
    airSlot: normAirSlot(x.airSlot),
    relatedLiveIds: w.medium === "video" && Array.isArray(x.relatedLiveIds) ? Array.from(new Set((x.relatedLiveIds as unknown[]).filter((id): id is string => typeof id === "string" && id !== ""))) : [],
  };
}

/** 記録に、足りない項目（視聴手段）を補う */
export function normalizeLog(l: Log): Log {
  const precision = l.datePrecision === "month" || l.datePrecision === "year" || l.datePrecision === "unknown" ? l.datePrecision : l.datePrecision === "day" ? "day" : undefined;
  const out: Log = { ...l, via: LOG_VIAS.find((v) => v === l.via) ?? null, place: typeof l.place === "string" ? l.place : "", source: typeof l.source === "string" ? l.source : "" };
  if (l.photoIds !== undefined) out.photoIds = Array.isArray(l.photoIds) ? [...new Set(l.photoIds.filter((id): id is string => typeof id === "string" && id !== ""))].slice(0, 10) : [];
  if (precision) out.datePrecision = precision;
  else delete out.datePrecision;
  return out;
}

/** 人物に、足りない項目（画像のURL）を補う */
export function normalizePerson(p: Person): Person {
  const url = typeof p.imageUrl === "string" ? p.imageUrl.trim() : "";
  return { ...p, imageUrl: url ? url : null };
}

export function normalizeData(d: Partial<DataSet>): DataSet {
  return { franchises: d.franchises ?? [], works: (d.works ?? []).map(normalizeWork), logs: (d.logs ?? []).map(normalizeLog), people: (d.people ?? []).map(normalizePerson) };
}
