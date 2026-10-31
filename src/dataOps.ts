import type { DataSet, Work } from "./types.js";

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

/** 古い形（段階2まで）の作品に、あとから足した項目を補う */
export function normalizeWork(w: Work): Work {
  return { ...w, personIds: Array.isArray(w.personIds) ? w.personIds : [], setlist: typeof w.setlist === "string" ? w.setlist : "", infoCheckedAt: typeof w.infoCheckedAt === "string" ? w.infoCheckedAt : null };
}

export function normalizeData(d: Partial<DataSet>): DataSet {
  return { franchises: d.franchises ?? [], works: (d.works ?? []).map(normalizeWork), logs: d.logs ?? [], people: d.people ?? [] };
}
