import { useState } from "react";
import { MEDIUM_LABEL, STATUS_LABEL } from "./constants";
import { Screen } from "./Screen";
import { searchMine } from "./searchLogic";
import type { DataSet, Work } from "./types";

export function SearchView({ data, onBack, onOpen }: { data: DataSet; onBack: () => void; onOpen: (w: Work) => void }) {
  const [query, setQuery] = useState("");
  const hits = searchMine(data, query);
  return (
    <Screen title="検索" onBack={onBack}>
      <input className="text-input" type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="作品名・読み仮名・感想・メモ" aria-label="検索する言葉" />
      <p className="muted small">外部の作品を探す機能は、あとの段階で足します。</p>
      {query.trim() !== "" && (
        <section className="card list-card">
          <div className="list-head">
            <h2>自分の記録</h2>
            <span className="muted small">{hits.length}件</span>
          </div>
          {hits.length === 0 ? (
            <p className="muted pad">見つかりませんでした。</p>
          ) : (
            <ul className="list">
              {hits.map((h) => (
                <li key={h.work.id}>
                  <button type="button" className="list-row" onClick={() => onOpen(h.work)}>
                    <span className="list-main">
                      <span className="list-name">
                        {h.work.title}
                        {h.work.seasonLabel && <span className="work-season"> {h.work.seasonLabel}</span>}
                      </span>
                      <span className="list-sub">
                        <span className="medium-tag">{MEDIUM_LABEL[h.work.medium]}</span>
                        {STATUS_LABEL[h.work.status]}
                      </span>
                      {h.logs.slice(0, 2).map((l) => (
                        <span key={l.id} className="list-sub wrap note-excerpt">
                          {l.note || l.place}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Screen>
  );
}
