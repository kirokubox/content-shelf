// 人物の画像（丸）。画像のURLが無い・読み込めないときは名前の1文字目を出す（v0.18.0）
import { useEffect, useState } from "react";
import type { Person } from "./types";

export function PersonImg({ person, size = 40 }: { person: Pick<Person, "name" | "imageUrl">; size?: number }) {
  const url = person.imageUrl ?? null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const style = { width: size, height: size };
  if (!url || failed) {
    const initial = Array.from(person.name.replace(/^[『「（(\s]+/, ""))[0] ?? "?";
    return <span className="person-img person-initial" style={{ ...style, fontSize: Math.round(size * 0.42) }} aria-hidden="true">{initial}</span>;
  }
  return <img className="person-img" style={style} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
