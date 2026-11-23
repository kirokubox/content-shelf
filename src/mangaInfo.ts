// マンガの作者と完結した日を AniList から入れる（v1.0.0）。純粋ロジック（取ってくるのは App）。
// 本人「作者順（アーティスト順）と完結順（発売日順）で並べたい」（`00_共通/41` M-Q4）。
// すでに入っている作者・完結日は上書きしない。何度呼んでも同じ結果。
import type { AnilistMedia } from "./anilist.js";
import { resolvePeople } from "./linkLogic.js";
import type { Person, Work } from "./types.js";

/** 取ってくる対象：AniList とつながったマンガで、作者が空か、完結しているのに完結日が無いもの */
export function needsMangaInfo(w: Work): boolean {
  return w.deletedAt === null && w.medium === "manga" && Boolean(w.externalIds.anilist) && (w.personIds.length === 0 || (w.workState === "finished" && !w.endDate));
}

export function mergeMangaInfo(works: readonly Work[], people: Person[], media: readonly AnilistMedia[], now: string): { works: Work[]; created: Person[] } {
  const byId = new Map(media.map((m) => [m.id, m]));
  let pool = [...people];
  const created: Person[] = [];
  const changed: Work[] = [];
  for (const w of works) {
    if (!needsMangaInfo(w)) continue;
    const m = byId.get(w.externalIds.anilist!);
    if (!m) continue;
    let next = w;
    if (w.personIds.length === 0 && m.authors.length > 0) {
      const r = resolvePeople(pool, m.authors, now);
      pool = [...pool, ...r.created];
      created.push(...r.created);
      next = { ...next, personIds: r.ids };
    }
    if (!w.endDate && m.endDate && m.status === "FINISHED") next = { ...next, endDate: m.endDate };
    if (next !== w) changed.push({ ...next, updatedAt: now });
  }
  return { works: changed, created };
}
