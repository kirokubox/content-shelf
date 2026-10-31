import type { DataSet, Log, Work } from "./types.js";

/** ひらがな・カタカナ・全角半角・大文字小文字の違いを無視して比べる */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

export interface SearchHit {
  work: Work;
  /** 感想・メモで当たった記録 */
  logs: Log[];
}

export function searchMine(data: DataSet, query: string): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const works = data.works.filter((w) => w.deletedAt === null);
  const logsByWork = new Map<string, Log[]>();
  for (const l of data.logs) {
    if (l.deletedAt !== null) continue;
    if (normalize(`${l.note} ${l.place}`).includes(q)) logsByWork.set(l.workId, [...(logsByWork.get(l.workId) ?? []), l]);
  }
  const hits: SearchHit[] = [];
  for (const w of works) {
    const self = normalize(`${w.title} ${w.kana} ${w.seasonLabel} ${w.memo} ${w.edition}`).includes(q);
    const logs = logsByWork.get(w.id) ?? [];
    if (self || logs.length > 0) hits.push({ work: w, logs });
  }
  return hits.sort((a, b) => b.work.touchedAt.localeCompare(a.work.touchedAt));
}
