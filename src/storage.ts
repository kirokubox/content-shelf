// 保存：IndexedDB（家計簿と同じ方式。仕様181 §6.1）。画面は全件をメモリに持ち、変更をここへ書き込む。
import { DB_NAME, DB_VERSION, PHOTO_STORE, STORES } from "./constants.js";
import { normalizeData } from "./dataOps.js";
import type { DataSet, Franchise, Log, Person, StoredPhoto, Work } from "./types.js";

type StoreName = (typeof STORES)[number];
type RecordOf<S extends StoreName> = S extends "works" ? Work : S extends "logs" ? Log : S extends "people" ? Person : Franchise;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // 無いストアだけ足す。既存のストアとデータには触れない
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        dbPromise = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error("別のタブを閉じてから、アプリを開き直してください。"));
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("保存が取り消されました"));
  });
}

function getAll<S extends StoreName>(db: IDBDatabase, name: S): Promise<RecordOf<S>[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(name, "readonly").objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result as RecordOf<S>[]);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAll(): Promise<DataSet> {
  const db = await openDb();
  const [franchises, works, logs, people] = await Promise.all([getAll(db, "franchises"), getAll(db, "works"), getAll(db, "logs"), getAll(db, "people")]);
  return normalizeData({ franchises, works, logs, people });
}

/** 変更分をまとめて書く（1つのトランザクション） */
export async function putRecords(changes: Partial<DataSet>): Promise<void> {
  const names = STORES.filter((n) => (changes[n]?.length ?? 0) > 0);
  if (names.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(names, "readwrite");
  for (const n of names) {
    const store = tx.objectStore(n);
    for (const r of changes[n]!) store.put(r);
  }
  await done(tx);
}

/** 全部入れ替え（バックアップから戻す） */
export async function replaceAll(data: DataSet): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...STORES], "readwrite");
  for (const n of STORES) {
    const store = tx.objectStore(n);
    store.clear();
    for (const r of data[n]) store.put(r);
  }
  await done(tx);
}

// ---- 写真（画像本体は重いので、作品の全件読み込みには乗せない） ----

async function photoTx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, mode);
    const req = run(tx.objectStore(PHOTO_STORE));
    let result: T | undefined;
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("保存が取り消されました"));
  });
}

export function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  return photoTx<StoredPhoto>("readonly", (s) => s.get(id) as IDBRequest<StoredPhoto>);
}

export async function getAllPhotos(): Promise<StoredPhoto[]> {
  return (await photoTx<StoredPhoto[]>("readonly", (s) => s.getAll() as IDBRequest<StoredPhoto[]>)) ?? [];
}

/** 写真の id だけ（追加・更新で、すでにある写真を飛ばすため） */
export async function getAllPhotoIds(): Promise<string[]> {
  return ((await photoTx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) ?? []).map(String);
}

/** 写真を入れる（同じ id は上書き） */
export async function putPhotos(photos: readonly StoredPhoto[]): Promise<void> {
  if (photos.length === 0) return;
  await photoTx("readwrite", (s) => { for (const ph of photos) s.put(ph); });
}

export async function deletePhoto(id: string): Promise<void> {
  await photoTx("readwrite", (s) => { s.delete(id); });
}

/** 全部入れ替え（バックアップから戻す） */
export async function replacePhotos(photos: readonly StoredPhoto[]): Promise<void> {
  await photoTx("readwrite", (s) => { s.clear(); for (const ph of photos) s.put(ph); });
}

/** ブラウザに「消さないで」と頼む（容量が苦しいときに自動で消されにくくなる） */
export async function requestPersist(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
