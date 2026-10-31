// 保存：IndexedDB（家計簿と同じ方式。仕様181 §6.1）。画面は全件をメモリに持ち、変更をここへ書き込む。
import { DB_NAME, DB_VERSION, STORES } from "./constants.js";
import type { DataSet, Franchise, Log, Work } from "./types.js";

type StoreName = (typeof STORES)[number];
type RecordOf<S extends StoreName> = S extends "works" ? Work : S extends "logs" ? Log : Franchise;

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
  const [franchises, works, logs] = await Promise.all([getAll(db, "franchises"), getAll(db, "works"), getAll(db, "logs")]);
  return { franchises, works, logs };
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
