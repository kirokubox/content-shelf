import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBackup } from "../src/backup.js";
import { normalizeData } from "../src/dataOps.js";
import { assemblePhotos, buildBackupFile, readBackupFile, referencedPhotos } from "../src/photoBackup.js";
import { emptyWork } from "../src/workFactory.js";
import type { DataSet, StoredPhoto } from "../src/types.js";

const NOW = "2026-11-03T03:00:00.000Z";

function photo(id: string, workId: string, bytes: number[]): StoredPhoto {
  const blob = new Blob([new Uint8Array(bytes)], { type: "image/webp" });
  return { id, workId, blob, mimeType: "image/webp", width: 10, height: 14, byteSize: blob.size, createdAt: NOW };
}

function dataWith(coverPhotoId: string | null): DataSet {
  const w = { ...emptyWork("novel", NOW), id: "w1", title: "テスト本", coverPhotoId };
  return normalizeData({ franchises: [], works: [w], logs: [], people: [] });
}

test("写真が無ければ今までどおりJSON", async () => {
  const f = await buildBackupFile(dataWith(null), [photo("ph1", "w1", [1, 2, 3])], NOW, "2026-11-03");
  assert.equal(f.fileName, "content-shelf-backup-2026-11-03.json");
  assert.equal(f.photoCount, 0);
  const { text, blobs } = await readBackupFile(f.blob);
  assert.equal(blobs.size, 0);
  assert.equal(parseBackup(text).ok, true);
});

test("表紙の写真があればZIPにして、読み戻すと同じ写真になる", async () => {
  const data = dataWith("ph1");
  const photos = [photo("ph1", "w1", [9, 8, 7, 6]), photo("ph-old", "w1", [1])];
  assert.deepEqual(referencedPhotos(data, photos).map((p) => p.id), ["ph1"]); // 使われていない写真は入れない
  const f = await buildBackupFile(data, photos, NOW, "2026-11-03");
  assert.equal(f.fileName, "content-shelf-backup-2026-11-03.zip");
  assert.equal(f.photoCount, 1);
  const { text, blobs } = await readBackupFile(f.blob);
  const r = parseBackup(text);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.works[0].coverPhotoId, "ph1");
  const { photos: back, missing } = assemblePhotos(text, blobs);
  assert.equal(missing, 0);
  assert.equal(back.length, 1);
  assert.equal(back[0].id, "ph1");
  assert.equal(back[0].mimeType, "image/webp");
  assert.deepEqual([...new Uint8Array(await back[0].blob.arrayBuffer())], [9, 8, 7, 6]);
});

test("ZIPに写真の本体が無いときは数だけ返す", () => {
  const text = JSON.stringify({ photos: [{ id: "ph1", workId: "w1", mimeType: "image/webp", width: 1, height: 1, byteSize: 1, createdAt: NOW }] });
  const r = assemblePhotos(text, new Map());
  assert.equal(r.photos.length, 0);
  assert.equal(r.missing, 1);
});

test("前の版のバックアップ（coverPhotoId が無い）も読める", () => {
  const w = { ...emptyWork("novel", NOW) } as Partial<ReturnType<typeof emptyWork>>;
  delete w.coverPhotoId;
  const d = normalizeData({ franchises: [], works: [w as ReturnType<typeof emptyWork>], logs: [], people: [] });
  assert.equal(d.works[0].coverPhotoId, null);
});
