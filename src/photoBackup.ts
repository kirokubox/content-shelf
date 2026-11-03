// 写真つきのバックアップ（季節日記と同じ形）。写真があるときは ZIP に
//   content-shelf-backup.json（いつものバックアップ＋写真の情報）と photos/<id>.webp を入れる。写真が無ければ今までどおり JSON だけ
import { buildBackup } from "./backup.js";
import type { DataSet, PhotoMeta, StoredPhoto } from "./types.js";
import { createZipBlob, readZipEntries } from "./zip.js";

export const BACKUP_JSON_NAME = "content-shelf-backup.json";

export function photoExtension(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

export function photoPath(meta: Pick<PhotoMeta, "id" | "mimeType">): string {
  return `photos/${meta.id}.${photoExtension(meta.mimeType)}`;
}

export function toMeta(p: StoredPhoto): PhotoMeta {
  return { id: p.id, workId: p.workId, mimeType: p.mimeType, width: p.width, height: p.height, byteSize: p.byteSize, createdAt: p.createdAt };
}

/** 作品から使われている写真だけ（差し替えの途中で残ったものは入れない） */
export function referencedPhotos(data: DataSet, photos: readonly StoredPhoto[]): StoredPhoto[] {
  const ids = new Set(data.works.map((w) => w.coverPhotoId).filter((id): id is string => !!id));
  return photos.filter((p) => ids.has(p.id));
}

/** 保存するファイル。写真があれば ZIP、無ければ JSON */
export async function buildBackupFile(data: DataSet, photos: readonly StoredPhoto[], exportedAt: string, today: string): Promise<{ blob: Blob; fileName: string; photoCount: number }> {
  const used = referencedPhotos(data, photos);
  const json = JSON.stringify(used.length > 0 ? { ...buildBackup(data, exportedAt), photos: used.map(toMeta) } : buildBackup(data, exportedAt), null, 2);
  if (used.length === 0) {
    return { blob: new Blob([json], { type: "application/json;charset=utf-8" }), fileName: `content-shelf-backup-${today}.json`, photoCount: 0 };
  }
  const zip = await createZipBlob(
    [{ path: BACKUP_JSON_NAME, blob: new Blob([json], { type: "application/json" }) }, ...used.map((p) => ({ path: photoPath(p), blob: p.blob })) /* 一覧用の小さい写真は入れない（取り込むときに作り直す） */],
    new Date(exportedAt),
  );
  return { blob: zip, fileName: `content-shelf-backup-${today}.zip`, photoCount: used.length };
}

async function isZip(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

/** 選んだファイル（JSON か ZIP）から、バックアップの文字列と写真の本体（パスごと）を取り出す */
export async function readBackupFile(file: Blob): Promise<{ text: string; blobs: Map<string, Blob> }> {
  if (!(await isZip(file))) return { text: await file.text(), blobs: new Map() };
  const entries = await readZipEntries(file);
  const json = entries.find((e) => e.path.replace(/^.*\//, "") === BACKUP_JSON_NAME);
  if (!json) throw new Error(`ZIPの中に ${BACKUP_JSON_NAME} がありません`);
  const root = json.path.slice(0, json.path.length - BACKUP_JSON_NAME.length);
  const blobs = new Map<string, Blob>();
  for (const e of entries) if (e.path.startsWith(`${root}photos/`)) blobs.set(e.path.slice(root.length), e.blob);
  return { text: await json.blob.text(), blobs };
}

function isMeta(v: unknown): v is PhotoMeta {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && r.id.length > 0 && typeof r.workId === "string" && typeof r.mimeType === "string" && typeof r.createdAt === "string";
}

/** バックアップの写真の情報と本体を合わせる。本体が見つからない写真は数だけ返す */
export function assemblePhotos(text: string, blobs: Map<string, Blob>): { photos: StoredPhoto[]; missing: number } {
  let metas: unknown = [];
  try {
    metas = (JSON.parse(text) as { photos?: unknown }).photos ?? [];
  } catch {
    return { photos: [], missing: 0 };
  }
  if (!Array.isArray(metas)) return { photos: [], missing: 0 };
  const photos: StoredPhoto[] = [];
  let missing = 0;
  for (const m of metas) {
    if (!isMeta(m)) continue;
    const blob = blobs.get(photoPath(m));
    if (!blob) {
      missing += 1;
      continue;
    }
    const typed = blob.type === m.mimeType ? blob : new Blob([blob], { type: m.mimeType });
    photos.push({ id: m.id, workId: m.workId, mimeType: m.mimeType, width: Number(m.width) || 0, height: Number(m.height) || 0, byteSize: typed.size, createdAt: m.createdAt, blob: typed });
  }
  return { photos, missing };
}
