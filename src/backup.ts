// バックアップの保存・検証・追加の差分。画面の言葉は「バックアップを保存／バックアップから戻す／バックアップから追加」
import { isDateKey } from "./dateUtils.js";
import { DATA_VERSION } from "./constants.js";
import { migrateV1ToV2, migrateV2ToV3 } from "./migrate.js";
import type { MigrationReport, MigrationV3Report } from "./migrate.js";
import { LOG_VIAS, MEDIA, WORK_STATES, WORK_STATUSES } from "./types.js";
import { normalizeData } from "./dataOps.js";
import type { BackupFile, DataSet, Franchise, Log, Person, Work } from "./types.js";

export function buildBackup(data: DataSet, exportedAt: string): BackupFile {
  return { app: "content-shelf", version: DATA_VERSION, exportedAt, franchises: data.franchises, works: data.works, logs: data.logs, people: data.people };
}

export function backupFileName(today: string): string {
  return `content-shelf-backup-${today}.json`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isNumOrNull(v: unknown): boolean {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

function checkBase(r: Record<string, unknown>): boolean {
  return isStr(r.id) && r.id.length > 0 && isStr(r.createdAt) && isStr(r.updatedAt) && (r.deletedAt === null || isStr(r.deletedAt));
}

/** 版1・版2に共通の作品の検査。版2は、あわせて新しい項目の形も見る（checkWorkV2） */
function checkWork(r: unknown): r is Work {
  if (!isObj(r) || !checkBase(r)) return false;
  return (
    (MEDIA as readonly unknown[]).includes(r.medium) &&
    (WORK_STATUSES as readonly unknown[]).includes(r.status) &&
    isStr(r.title) &&
    isNumOrNull(r.total) &&
    isNumOrNull(r.progress) &&
    isNumOrNull(r.latestKnown) &&
    (r.readThrough === null || isDateKey(r.readThrough)) &&
    (r.schedule === null || (isObj(r.schedule) && isDateKey(r.schedule.firstDate) && Array.isArray(r.schedule.skipDates)))
  );
}

function checkWorkV2(r: unknown): r is Work {
  if (!checkWork(r)) return false;
  const x = r as unknown as Record<string, unknown>;
  return (
    (x.workState === null || (WORK_STATES as readonly unknown[]).includes(x.workState)) &&
    Array.isArray(x.cours) &&
    isObj(x.purchase) &&
    isStr(x.partLabel)
  );
}

function checkLog(r: unknown): r is Log {
  if (!isObj(r) || !checkBase(r)) return false;
  if (r.via !== undefined && r.via !== null && !(LOG_VIAS as readonly unknown[]).includes(r.via)) return false;
  return isStr(r.workId) && (r.kind === "progress" || r.kind === "view") && isDateKey(r.date) && isNumOrNull(r.position) && isStr(r.note);
}

function checkPerson(r: unknown): r is Person {
  return isObj(r) && checkBase(r) && isStr(r.name);
}

function checkFranchise(r: unknown): r is Franchise {
  return isObj(r) && checkBase(r) && isStr(r.title);
}

export type ParseResult =
  | { ok: true; data: DataSet; exportedAt: string; /** 版1から移し替えたときの結果 */ migration: MigrationReport | null; /** 版2から移し替えたときの結果（v0.17.0） */ migrationV3?: MigrationV3Report | null }
  | { ok: false; error: string };

/** 読み込んだ文字列をバックアップとして検証する。1件でも形が崩れていたら何も読まない */
export function parseBackup(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "ファイルを読めませんでした（形式が違います）" };
  }
  if (!isObj(json) || json.app !== "content-shelf") return { ok: false, error: "コンテンツ棚のバックアップではありません" };
  if (json.version !== 1 && json.version !== 2 && json.version !== 3) return { ok: false, error: "このバージョンのバックアップには対応していません" };
  // 版2と版3は、作品の検査が同じ（版3で足した項目は無くても補える）
  const isV2 = json.version === 2 || json.version === 3;
  const { franchises, works, logs } = json;
  if (!Array.isArray(franchises) || !Array.isArray(works) || !Array.isArray(logs)) return { ok: false, error: "バックアップの中身が足りません" };
  const badWork = works.findIndex((w) => !(isV2 ? checkWorkV2(w) : checkWork(w)));
  if (badWork >= 0) return { ok: false, error: `作品の${badWork + 1}件目の形が正しくありません` };
  const badLog = logs.findIndex((l) => !checkLog(l));
  if (badLog >= 0) return { ok: false, error: `記録の${badLog + 1}件目の形が正しくありません` };
  const badFr = franchises.findIndex((f) => !checkFranchise(f));
  if (badFr >= 0) return { ok: false, error: `親作品の${badFr + 1}件目の形が正しくありません` };
  // people は段階3で足した。古いバックアップには無いので、無ければ空
  const people = json.people === undefined ? [] : json.people;
  if (!Array.isArray(people)) return { ok: false, error: "バックアップの中身が足りません" };
  const badP = people.findIndex((p) => !checkPerson(p));
  if (badP >= 0) return { ok: false, error: `人物の${badP + 1}件目の形が正しくありません` };
  const exportedAt = isStr(json.exportedAt) ? json.exportedAt : "";
  if (json.version === 3) return { ok: true, data: normalizeData({ franchises, works, logs, people } as DataSet), exportedAt, migration: null, migrationV3: null };
  if (json.version === 2) {
    // 版2：持っている形・読む手段を2段にしてから取り込む
    const photos = Array.isArray(json.photos) ? json.photos : [];
    const m3 = migrateV2ToV3({ franchises, works, logs, people, photos });
    if (!m3.ok) return { ok: false, error: m3.error };
    return { ok: true, data: m3.data, exportedAt, migration: null, migrationV3: m3.report };
  }
  // 版1：新しい形へ移し替えてから取り込む（件数が合わなければ何も読まない）
  const photos = Array.isArray(json.photos) ? json.photos : [];
  const m = migrateV1ToV2({ franchises, works, logs, people, photos });
  if (!m.ok) return { ok: false, error: m.error };
  return { ok: true, data: m.data, exportedAt, migration: m.report };
}

export interface MergePlan {
  add: DataSet;
  counts: { label: string; incoming: number; added: number; skipped: number }[];
}

/** 追加：同じ id はすでにあるものを残して飛ばす（上書きしない） */
export function planMerge(current: DataSet, incoming: DataSet): MergePlan {
  const pick = <T extends { id: string }>(cur: T[], inc: T[]) => {
    const ids = new Set(cur.map((r) => r.id));
    return inc.filter((r) => !ids.has(r.id));
  };
  const add: DataSet = {
    franchises: pick(current.franchises, incoming.franchises),
    works: pick(current.works, incoming.works),
    logs: pick(current.logs, incoming.logs),
    people: pick(current.people, incoming.people),
  };
  return {
    add,
    counts: [
      { label: "作品", incoming: incoming.works.length, added: add.works.length, skipped: incoming.works.length - add.works.length },
      { label: "記録", incoming: incoming.logs.length, added: add.logs.length, skipped: incoming.logs.length - add.logs.length },
      { label: "親作品", incoming: incoming.franchises.length, added: add.franchises.length, skipped: incoming.franchises.length - add.franchises.length },
      { label: "人物", incoming: incoming.people.length, added: add.people.length, skipped: incoming.people.length - add.people.length },
    ],
  };
}

export interface UpdatePlan {
  changes: DataSet;
  counts: { label: string; added: number; updated: number; kept: number }[];
}

/**
 * 更新：同じ id は、取り込む方の updatedAt が新しいときだけ上書きする。無い id は足す。
 * 端末で後から直したもの（端末の方が新しい）は残る
 */
export function planUpdate(current: DataSet, incoming: DataSet): UpdatePlan {
  const pick = <T extends { id: string; updatedAt: string }>(cur: T[], inc: T[]) => {
    const map = new Map(cur.map((r) => [r.id, r]));
    let added = 0;
    let updated = 0;
    let kept = 0;
    const out: T[] = [];
    for (const r of inc) {
      const c = map.get(r.id);
      if (!c) { out.push(r); added += 1; }
      else if (r.updatedAt > c.updatedAt) { out.push(r); updated += 1; }
      else kept += 1;
    }
    return { out, added, updated, kept };
  };
  const f = pick(current.franchises, incoming.franchises);
  const w = pick(current.works, incoming.works);
  const l = pick(current.logs, incoming.logs);
  const p = pick(current.people, incoming.people);
  return {
    changes: { franchises: f.out, works: w.out, logs: l.out, people: p.out },
    counts: [
      { label: "作品", added: w.added, updated: w.updated, kept: w.kept },
      { label: "記録", added: l.added, updated: l.updated, kept: l.kept },
      { label: "人物", added: p.added, updated: p.updated, kept: p.kept },
      { label: "親作品", added: f.added, updated: f.updated, kept: f.kept },
    ],
  };
}
