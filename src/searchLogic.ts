import { LOG_VIA_LABEL, accessText } from "./constants.js";
import { courSearchText } from "./courLogic.js";
import type { DataSet, Franchise, Log, Person, Work } from "./types.js";

/** ひらがな・カタカナ・全角半角・大文字小文字の違いを無視して比べる */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

export const RECENT_SEARCH_LIMIT = 8;

/** localStorageから読んだ値を、安全な最近の検索語へ整える。 */
export function parseRecentSearches(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const term = raw.trim();
    if (!term || out.some((item) => normalize(item) === normalize(term))) continue;
    out.push(term);
    if (out.length === RECENT_SEARCH_LIMIT) break;
  }
  return out;
}

/** 結果があった検索語だけを先頭へ。表記ゆれを含む同じ語は1つにする。 */
export function rememberRecentSearch(recent: string[], query: string, hasResults: boolean): string[] {
  const term = query.trim();
  if (!hasResults || !term) return parseRecentSearches(recent);
  return [term, ...recent.filter((item) => normalize(item) !== normalize(term))].slice(0, RECENT_SEARCH_LIMIT);
}

export function removeRecentSearch(recent: string[], query: string): string[] {
  return recent.filter((item) => normalize(item) !== normalize(query));
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
    if (normalize(`${l.note} ${l.place} ${l.via ? LOG_VIA_LABEL[l.via] : ""}`).includes(q)) logsByWork.set(l.workId, [...(logsByWork.get(l.workId) ?? []), l]);
  }
  const hits: SearchHit[] = [];
  const peopleName = new Map(data.people.filter((p) => p.deletedAt === null).map((p) => [p.id, p.name]));
  for (const w of works) {
    const names = w.personIds.map((id) => peopleName.get(id) ?? "").join(" ");
    const self = normalize(`${w.title} ${w.kana} ${courSearchText(w)} ${w.memo} ${w.edition} ${w.setlist} ${names} ${accessText(w.access, w.accessStore)}`).includes(q);
    const logs = logsByWork.get(w.id) ?? [];
    if (self || logs.length > 0) hits.push({ work: w, logs });
  }
  return hits.sort((a, b) => b.work.touchedAt.localeCompare(a.work.touchedAt));
}

export function searchPeople(data: DataSet, query: string): Person[] {
  const q = normalize(query);
  if (!q) return [];
  return data.people.filter((p) => p.deletedAt === null && normalize(`${p.name} ${p.kana}`).includes(q));
}

export function searchFranchises(data: DataSet, query: string): Franchise[] {
  const q = normalize(query);
  if (!q) return [];
  return data.franchises.filter((f) => f.deletedAt === null && normalize(`${f.title} ${f.kana}`).includes(q));
}
