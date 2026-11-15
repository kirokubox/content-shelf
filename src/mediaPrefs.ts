// 使う種類（登録画面に出す種類）。端末ごとの表示の設定で、作品データ・バックアップには入れない。
import { MEDIA } from "./types.js";
import type { Medium } from "./types.js";

export const ENABLED_MEDIA_KEY = "content-shelf:enabled-media";

/** localStorage から読んだ値を整える。未設定・壊れた値は null（＝全部使う） */
export function parseEnabledMedia(value: unknown): Medium[] | null {
  if (!Array.isArray(value)) return null;
  const picked = MEDIA.filter((m) => value.includes(m));
  return picked.length > 0 ? picked : null;
}

/** 登録画面に出す種類（並びは MEDIA の順）。未設定なら全部 */
export function visibleMedia(enabled: Medium[] | null): Medium[] {
  return enabled === null ? [...MEDIA] : MEDIA.filter((m) => enabled.includes(m));
}

/** その画面に実在する種類から、「使う種類」に含まれるものだけを絞り込み候補へ出す */
export function visibleFilterMedia(available: Medium[], enabled: Medium[] | null): Medium[] {
  const allowed = new Set(visibleMedia(enabled));
  return MEDIA.filter((m) => allowed.has(m) && available.includes(m));
}

/** 種類を1つ入れ外しする。最後の1つは外せない（何も登録できなくなるため） */
export function toggleMedium(enabled: Medium[] | null, medium: Medium): Medium[] {
  const current = visibleMedia(enabled);
  if (current.includes(medium)) return current.length === 1 ? current : current.filter((m) => m !== medium);
  return MEDIA.filter((m) => m === medium || current.includes(m));
}
