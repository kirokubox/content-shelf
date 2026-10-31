// 親作品・人物のつながり（段階3）。名前で探し、無ければ新しく作る。自動で統合はしない
import { normalize } from "./searchLogic.js";
import type { DataSet, Franchise, Person, Work } from "./types.js";
import { newBase } from "./workFactory.js";

export function findFranchiseByTitle(franchises: Franchise[], title: string): Franchise | null {
  const key = normalize(title);
  if (!key) return null;
  return franchises.find((f) => f.deletedAt === null && normalize(f.title) === key) ?? null;
}

export function findPersonByName(people: Person[], name: string): Person | null {
  const key = normalize(name);
  if (!key) return null;
  return people.find((p) => p.deletedAt === null && normalize(p.name) === key) ?? null;
}

/** 親作品の名前から id を決める。無ければ新しい親作品を作る（created に入れて返す） */
export function resolveFranchise(franchises: Franchise[], title: string, now: string): { id: string | null; created: Franchise[] } {
  const t = title.trim();
  if (!t) return { id: null, created: [] };
  const found = findFranchiseByTitle(franchises, t);
  if (found) return { id: found.id, created: [] };
  const f: Franchise = { ...newBase(now), title: t, kana: "", memo: "" };
  return { id: f.id, created: [f] };
}

/** 人物の名前の並びから id を決める。無い人は新しく作る。同じ人は1回だけ */
export function resolvePeople(people: Person[], names: string[], now: string): { ids: string[]; created: Person[] } {
  const ids: string[] = [];
  const created: Person[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const found = findPersonByName([...people, ...created], name);
    const id = found ? found.id : (() => {
      const p: Person = { ...newBase(now), name, kana: "", memo: "" };
      created.push(p);
      return p.id;
    })();
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids, created };
}

export function worksOfFranchise(data: DataSet, franchiseId: string): Work[] {
  return data.works.filter((w) => w.deletedAt === null && w.franchiseId === franchiseId);
}

export function worksOfPerson(data: DataSet, personId: string): Work[] {
  return data.works.filter((w) => w.deletedAt === null && w.personIds.includes(personId));
}

export function personNames(data: DataSet, ids: string[]): string[] {
  return ids.map((id) => data.people.find((p) => p.id === id)?.name).filter((n): n is string => !!n);
}
