// 表紙の画像。自分で撮った写真があればそれ、なければ画像のURL。どちらも無ければ種類色＋題名を出す。
// 画像のURLが読み込めなかったときも、種類色＋題名に切り替える（v0.18.0）
import { useEffect, useState } from "react";
import { useCoverSrc } from "./useCover";
import type { PhotoSize } from "./useCover";
import type { Work } from "./types";

interface Props {
  work: Pick<Work, "coverPhotoId" | "coverUrl" | "medium" | "title">;
  className?: string;
  lazy?: boolean;
  /** 一覧は小さい写真（初期値）、詳細は大きい写真 */
  size?: PhotoSize;
  onClick?: () => void;
}

export function CoverImg({ work, className, lazy = true, size = "thumb", onClick }: Props) {
  const src = useCoverSrc(work, size);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [src]);
  if (!src || failed === src) {
    return (
      <span className={["cover-fallback", `cover-${work.medium}`, className].filter(Boolean).join(" ")} onClick={onClick}>
        <span className="cover-fallback-title">{work.title}</span>
      </span>
    );
  }
  return <img className={className} src={src} alt="" loading={lazy ? "lazy" : undefined} referrerPolicy="no-referrer" onError={() => setFailed(src)} onClick={onClick} />;
}
