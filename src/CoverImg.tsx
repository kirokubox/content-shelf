// 表紙の画像。自分で撮った写真があればそれ、なければ画像のURL。どちらも無いときは fallback を出す
import type { ReactNode } from "react";
import { useCoverSrc } from "./useCover";
import type { PhotoSize } from "./useCover";
import type { Work } from "./types";

interface Props {
  work: Pick<Work, "coverPhotoId" | "coverUrl">;
  className?: string;
  /** 表紙が無いときに出すもの（無ければ何も出さない） */
  fallback?: ReactNode;
  lazy?: boolean;
  /** 一覧は小さい写真（初期値）、詳細は大きい写真 */
  size?: PhotoSize;
  onClick?: () => void;
}

export function CoverImg({ work, className, fallback = null, lazy = true, size = "thumb", onClick }: Props) {
  const src = useCoverSrc(work, size);
  if (!src) return <>{fallback}</>;
  return <img className={className} src={src} alt="" loading={lazy ? "lazy" : undefined} onClick={onClick} />;
}
