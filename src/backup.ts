// バックアップの保存・検証・追加の差分。画面の言葉は「バックアップを保存／バックアップから戻す／バックアップから追加」
import { isDateKey } from "./dateUtils.js";
import { MEDIA, WORK_STATUSES } from "./types.js";
import type { BackupFile, DataSet, Franchise, Log, Work } from "./types.js";

export function buildBackup(data: DataSet, exportedAt: string): BackupFile {
  return { app: "content-shelf", version: 1, exportedAt, franchises: data.franchises, works: data.works, logs: data.logs };
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

function checkLog(r: unknown): r is Log {
  if (!isObj(r) || !checkBase(r)) return false;
  return isStr(r.workId) && (r.kind === "progress" || r.kind === "view") && isDateKey(r.date) && isNumOrNull(r.position) && isStr(r.note);
}

function checkFranchise(r: unknown): r is Franchise {
  return isObj(r) && checkBase(r) && isStr(r.title);
}

export type ParseResult = { ok: true; data: DataSet; exportedAt: string } | { ok: false; error: string };

/** 読み込んだ文字列をバックアップとして検証する。1件でも形が崩れていたら何も読まない */
export function parseBackup(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "ファイルを読めませんでした（形式が違います）" };
  }
  if (!isObj(json) || json.app !== "content-shelf") return { ok: false, error: "コンテンツ棚のバックアップではありません" };
  if (json.version !== 1) return { ok: false, error: "このバージョンのバックアップには対応していません" };
  const { franchises, works, logs } = json;
  if (!Array.isArray(franchises) || !Array.isArray(works) || !Array.isArray(logs)) return { ok: false, error: "バックアップの中身が足りません" };
  const badWork = works.findIndex((w) => !checkWork(w));
  if (badWork >= 0) return { ok: false, error: `作品の${badWork + 1}件目の形が正しくありません` };
  const badLog = logs.findIndex((l) => !checkLog(l));
  if (badLog >= 0) return { ok: false, error: `記録の${badLog + 1}件目の形が正しくありません` };
  const badFr = franchises.findIndex((f) => !checkFranchise(f));
  if (badFr >= 0) return { ok: false, error: `親作品の${badFr + 1}件目の形が正しくありません` };
  return { ok: true, data: { franchises, works, logs } as DataSet, exportedAt: isStr(json.exportedAt) ? json.exportedAt : "" };
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
  };
  return {
    add,
    counts: [
      { label: "作品", incoming: incoming.works.length, added: add.works.length, skipped: incoming.works.length - add.works.length },
      { label: "記録", incoming: incoming.logs.length, added: add.logs.length, skipped: incoming.logs.length - add.logs.length },
      { label: "親作品", incoming: incoming.franchises.length, added: add.franchises.length, skipped: incoming.franchises.length - add.franchises.length },
    ],
  };
}
