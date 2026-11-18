import { useEffect, useState } from "react";
import { subLabel } from "./courLogic";
import { mediumTag, workStatusWord } from "./constants";
import type { AnilistMedia } from "./anilist";
import { AnilistResults } from "./AnilistPicker";
import { Screen } from "./Screen";
import { parseRecentSearches, rememberRecentSearch, removeRecentSearch, searchFranchises, searchMine, searchPeople } from "./searchLogic";
import { ownedGapSummary } from "./progressLogic";
import type { DataSet, Franchise, Person, Work } from "./types";

const RECENT_SEARCHES_KEY = "content-shelf:recent-searches";

function loadRecentSearches(): string[] {
  try {
    return parseRecentSearches(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function SearchView({ data, onBack, onOpen, onOpenPerson, onOpenFranchise, onPickExternal }: { data: DataSet; onBack: () => void; onOpen: (w: Work) => void; onOpenPerson: (p: Person) => void; onOpenFranchise: (f: Franchise) => void; onPickExternal: (m: AnilistMedia) => void }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"mine" | "ANIME" | "MANGA">("mine");
  const [recent, setRecent] = useState(loadRecentSearches);
  const hits = searchMine(data, query);
  const people = searchPeople(data, query);
  const franchises = searchFranchises(data, query);
  const saveRecent = (next: string[]) => {
    setRecent(next);
    try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch { /* 表示用の履歴なので、保存できなくても検索は続ける */ }
  };
  const rememberCurrent = () => saveRecent(rememberRecentSearch(recent, query, hits.length + people.length + franchises.length > 0));
  useEffect(() => {
    if (scope !== "mine" || query.trim() === "") return;
    const hasResults = hits.length + people.length + franchises.length > 0;
    if (!hasResults) return;
    const timer = window.setTimeout(() => saveRecent(rememberRecentSearch(recent, query, true)), 600);
    return () => window.clearTimeout(timer);
    // recentを依存に入れると、保存直後に同じタイマーを作り直すため除外する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scope, hits.length, people.length, franchises.length]);
  return (
    <Screen title="検索" onBack={onBack}>
      <input className="text-input" type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="作品名・人物・感想・メモ" aria-label="検索する言葉" />
      <div className="segmented">
        {([["mine", "自分の記録"], ["ANIME", "アニメを探す"], ["MANGA", "マンガを探す"]] as const).map(([id, label]) => (
          <button key={id} type="button" className={`seg${scope === id ? " on" : ""}`} onClick={() => setScope(id)}>{label}</button>
        ))}
      </div>
      {scope === "mine" && query.trim() === "" && recent.length > 0 && (
        <section className="card recent-searches">
          <div className="list-head">
            <h2>最近探した言葉</h2>
            <button type="button" className="text-action small" onClick={() => saveRecent([])}>すべて消す</button>
          </div>
          <div className="recent-search-list">
            {recent.map((term) => (
              <div className="recent-search-row" key={term}>
                <button type="button" className="recent-search-term" onClick={() => setQuery(term)}>{term}</button>
                <button type="button" className="icon-btn recent-search-delete" aria-label={`${term}を履歴から消す`} onClick={() => saveRecent(removeRecentSearch(recent, term))}>×</button>
              </div>
            ))}
          </div>
        </section>
      )}
      {scope !== "mine" && (
        <section className="card list-card">
          <div className="list-head"><h2>AniListの作品</h2><span className="muted small">選ぶと登録画面が開きます</span></div>
          {query.trim() === "" ? <p className="muted pad">作品名を入れてください。</p> : <AnilistResults term={query} type={scope} onPick={onPickExternal} />}
        </section>
      )}
      {scope === "mine" && query.trim() !== "" && (people.length > 0 || franchises.length > 0) && (
        <section className="card list-card">
          <div className="list-head">
            <h2>人物・親作品</h2>
          </div>
          <ul className="list">
            {franchises.map((f) => (
              <li key={f.id}>
                <button type="button" className="list-row" onClick={() => { rememberCurrent(); onOpenFranchise(f); }}>
                  <span className="list-main"><span className="list-name">{f.title}</span><span className="list-sub">親作品</span></span>
                </button>
              </li>
            ))}
            {people.map((p) => (
              <li key={p.id}>
                <button type="button" className="list-row" onClick={() => { rememberCurrent(); onOpenPerson(p); }}>
                  <span className="list-main"><span className="list-name">{p.name}</span><span className="list-sub">人物</span></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {scope === "mine" && query.trim() !== "" && (
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
                  <button type="button" className="list-row" onClick={() => { rememberCurrent(); onOpen(h.work); }}>
                    <span className="list-main">
                      <span className="list-name">
                        {h.work.title}
                        {subLabel(h.work) && <span className="work-season"> {subLabel(h.work)}</span>}
                      </span>
                      <span className="list-sub">
                        <span className="medium-tag">{mediumTag(h.work)}</span>
                        {workStatusWord(h.work, h.work.status)}
                        {ownedGapSummary(h.work).count > 0 && <span className="gap-note">抜け {ownedGapSummary(h.work).count}巻</span>}
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
