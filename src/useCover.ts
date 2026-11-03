// 表紙の出し方：自分で撮った写真（coverPhotoId）があればそれ、なければ画像のURL（coverUrl）。
// 一覧で同じ写真を何度も読まないよう、作った objectURL は id ごとに覚えておく（写真は縮小済みで小さい）
import { useEffect, useState } from "react";
import { getPhoto } from "./storage";
import type { Work } from "./types";

const urlCache = new Map<string, string>();
const loading = new Map<string, Promise<string | null>>();

export type PhotoSize = "thumb" | "full";

const keyOf = (id: string, size: PhotoSize) => `${size}:${id}`;

function loadPhotoUrl(id: string, size: PhotoSize): Promise<string | null> {
  const key = keyOf(id, size);
  const hit = urlCache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = loading.get(key);
  if (!p) {
    p = getPhoto(id)
      .then((ph) => {
        const blob = size === "thumb" ? ph?.thumb ?? ph?.blob : ph?.blob;
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        urlCache.set(key, url);
        return url;
      })
      .catch(() => null)
      .finally(() => loading.delete(key));
    loading.set(key, p);
  }
  return p;
}

/** 保存したばかりの写真を、読み直さずに出せるようにする */
export function rememberPhoto(photo: { id: string; blob: Blob; thumb?: Blob }): void {
  for (const [size, blob] of [["full", photo.blob], ["thumb", photo.thumb ?? photo.blob]] as const) {
    const key = keyOf(photo.id, size);
    if (!urlCache.has(key)) urlCache.set(key, URL.createObjectURL(blob));
  }
}

/** バックアップから戻したときなど、覚えたURLを捨てる */
export function forgetPhotoUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

/** 写真の id から表示用のURL（読み込み中・無いときは null） */
export function usePhotoUrl(id: string | null, size: PhotoSize = "thumb"): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? urlCache.get(keyOf(id, size)) ?? null : null));
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    const hit = urlCache.get(keyOf(id, size));
    if (hit) {
      setUrl(hit);
      return;
    }
    setUrl(null);
    let alive = true;
    void loadPhotoUrl(id, size).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [id, size]);
  return url;
}

/** 作品の表紙のURL（写真 → 画像のURL の順）。一覧は小さい写真、詳細は大きい写真 */
export function useCoverSrc(work: Pick<Work, "coverPhotoId" | "coverUrl">, size: PhotoSize = "thumb"): string | null {
  const photo = usePhotoUrl(work.coverPhotoId, size);
  if (work.coverPhotoId) return photo ?? work.coverUrl;
  return work.coverUrl;
}
