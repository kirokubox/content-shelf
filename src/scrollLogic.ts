// 上部の切り替えを隠すかの判定（v0.20.0）。純粋ロジック
/** これより上（一覧の先頭近く）では常に出す */
export const TOP_ZONE = 48;
/** 指のぶれで出たり消えたりしないよう、これだけ動いたら向きを決める */
export const THRESHOLD = 8;

/** スクロールの向きから隠すかを決める（純粋な計算。テスト用に分けた） */
export function nextHidden(hidden: boolean, prevTop: number, top: number): boolean {
  if (top <= TOP_ZONE) return false;
  if (top - prevTop > THRESHOLD) return true;
  if (prevTop - top > THRESHOLD) return false;
  return hidden;
}

