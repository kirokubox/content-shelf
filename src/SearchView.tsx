import { useState } from "react";
import { MEDIUM_LABEL, STATUS_LABEL } from "./constants";
import { Screen } from "./Screen";
import { searchFranchises, searchMine, searchPeople } from "./searchLogic";
import type { DataSet, Franchise, Person, Work } from "./types";

export function SearchView({ data, onBack, onOpen, onOpenPerson, onOpenFranchise }: { data: DataSet; onBack: () => void; onOpen: (w: Work) => void; onOpenPerson: (p: Person) => void; onOpenFranchise: (f: Franchise) => void }) {
  const [query, setQuery] = useState("");
  const hits = searchMine(data, query);
  const people = searchPeople(data, query);
  const franchises = searchFranchises(data, query);
  return (
    <Screen title="検索" onBack={onBack}>
      <input className="text-input" type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="作品名・人物・感想・メモ" aria-label="検索する言葉" />
      <p className="muted small">外部の作品を探す機能は、あとの段階で足します。</p>
      {query.trim() !== "" && (people.length > 0 || franchises.length > 0) && (
        <section className="card list-card">
          <div className="list-head">
            <h2>人物・親作品</h2>
          </div>
          <ul className="list">
            {franchises.map((f) => (
              <li key={f.id}>
                <button type="button" className="list-row" onClick={() => onOpenFranchise(f)}>
                  <span className="list-main"><span className="list-name">{f.title}</span><span className="list-sub">親作品</span></span>
                </button>
              </li>
            ))}
            {people.map((p) => (
              <li key={p.id}>
                <button type="button" className="list-row" onClick={() => onOpenPerson(p)}>
                  <span className="list-main"><span className="list-name">{p.name}</span><span className="list-sub">人物</span></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
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
