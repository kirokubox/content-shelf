import { useEffect, useRef, useState } from "react";
import { searchAnilist, seasonLabelOf } from "./anilist";
import type { AnilistMedia, AnilistType } from "./anilist";

const STATUS_JA: Record<string, string> = {
  FINISHED: "完結",
  RELEASING: "放送・連載中",
  NOT_YET_RELEASED: "これから",
  HIATUS: "休止中",
  CANCELLED: "中止",
};

/** AniListの作品を探して選ぶ。候補は選ぶまで登録しない */
export function AnilistResults({ term, type, onPick }: { term: string; type: AnilistType; onPick: (m: AnilistMedia) => void }) {
  const [list, setList] = useState<AnilistMedia[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const t = term.trim();
    setError("");
    if (!t) {
      setList(null);
      return;
    }
    const ctrl = new AbortController();
    window.clearTimeout(timer.current);
    // 打つたびに問い合わせないよう、少し待ってから探す
    timer.current = window.setTimeout(() => {
      setLoading(true);
      searchAnilist(t, type, ctrl.signal)
        .then(setList)
        .catch((e) => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "探せませんでした"); })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, 450);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer.current);
    };
  }, [term, type]);

  if (error) return <p className="notice danger">{error}（通信できないときは、そのまま手で入れられます）</p>;
  if (loading && !list) return <p className="muted small pad">探しています…</p>;
  if (!list) return null;
  if (list.length === 0) return <p className="muted small pad">見つかりませんでした。手で入れられます。</p>;
  return (
    <ul className="list anilist-list">
      {list.map((m) => (
        <li key={m.id}>
          <button type="button" className="list-row" onClick={() => onPick(m)}>
            {m.cover ? <img className="cover-thumb" src={m.cover} alt="" loading="lazy" /> : <span className="cover-thumb" />}
            <span className="list-main">
              <span className="list-name">{m.title}</span>
              <span className="list-sub wrap">
                {[
                  seasonLabelOf(m) || (m.startDate ? m.startDate.slice(0, 4) + "年" : ""),
                  m.status ? STATUS_JA[m.status] ?? "" : "",
                  m.type === "ANIME" ? (m.episodes ? `全${m.episodes}話` : m.nextEpisode ? `次は第${m.nextEpisode}話` : "") : m.volumes ? `全${m.volumes}巻` : "",
                  m.format ?? "",
                ].filter(Boolean).join("・")}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
