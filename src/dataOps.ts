import type { DataSet } from "./types.js";

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
  };
}

export const EMPTY_DATA: DataSet = { franchises: [], works: [], logs: [] };
