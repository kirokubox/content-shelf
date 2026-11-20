// LIVE と映像作品（円盤）を分ける（v0.20.0）。純粋ロジック。
// 円盤（Blu-ray・DVD）は映像作品だけが持つ。LIVE に付いていた購入情報は、映像作品を作って移す。
// 何度呼んでも同じ結果（移したあとの LIVE には購入情報が無いので、もう作らない）。
// 作る映像作品の id は LIVE の id から決めるので、別の端末で同じ移し替えをしても二重にならない。
import { emptyWork } from "./workFactory.js";
import type { Work } from "./types.js";

/** LIVE に購入情報（持ってる・予約・買う予定、または Blu-ray/DVD の形）が付いているか */
export function liveHasPurchase(w: Work): boolean {
  return w.medium === "live" && w.deletedAt === null && (w.purchase.stage !== "none" || w.purchase.format !== null);
}

export function discIdForLive(liveId: string): string {
  return `disc-${liveId}`;
}

export interface LiveDiscSplit {
  /** 新しく作った映像作品 */
  created: Work[];
  /** 購入情報を外した LIVE */
  updated: Work[];
}

export function splitLiveDiscs(works: readonly Work[], now: string): LiveDiscSplit {
  const existing = new Set(works.map((w) => w.id));
  const created: Work[] = [];
  const updated: Work[] = [];
  for (const live of works) {
    if (!liveHasPurchase(live)) continue;
    const id = discIdForLive(live.id);
    if (!existing.has(id)) {
      created.push({
        ...emptyWork("video", now),
        id,
        title: live.title,
        kana: live.kana,
        franchiseId: live.franchiseId,
        personIds: [...live.personIds],
        purchase: { ...live.purchase },
        coverUrl: live.coverUrl,
        // 円盤を見たかは分からないので「見たい」（積読）にする。見ていたら記録すれば済になる
        status: "wish",
        relatedLiveIds: [live.id],
        legacyNote: `イベント「${live.title}」に付いていた購入情報から作った映像作品（v0.20.0）`,
        touchedAt: now,
      });
    }
    updated.push({ ...live, purchase: { stage: "none", format: null, store: null }, updatedAt: now });
  }
  return { created, updated };
}

/** その LIVE を関連LIVEに持つ映像作品 */
export function discsOfLive(works: readonly Work[], liveId: string): Work[] {
  return works.filter((w) => w.deletedAt === null && w.medium === "video" && w.relatedLiveIds.includes(liveId));
}
