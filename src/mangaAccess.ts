// マンガの読む手段を「週刊誌／漫喫／レンタル」にそろえる（v1.0.0）。純粋ロジック。
// 所持で読むときは空（紙・電子は購入の欄で分かる）。古い 紙・電子 は読む手段から外し、電子・ジャンプ＋ は週刊誌にする
// （ジャンプ＋は週刊少年ジャンプのアプリ。2026-11-23 本人「合ってます進めて」、`00_共通/41` M-Q1）。何度呼んでも同じ結果。
import type { Work } from "./types.js";

export function convertMangaAccess(works: readonly Work[], now: string): Work[] {
  const updated: Work[] = [];
  for (const w of works) {
    if (w.medium !== "manga" || (w.access !== "paper" && w.access !== "digital")) continue;
    const access = w.access === "digital" && w.accessStore === "jump_plus" ? "weekly" : null;
    updated.push({ ...w, access, accessStore: null, updatedAt: now });
  }
  return updated;
}
