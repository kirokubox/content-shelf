import { useState } from "react";
import { subLabel } from "./courLogic";
import { CoverImg } from "./CoverImg";
import { MEDIUM_LABEL, mediumTag, workStatusWord } from "./constants";
import { formatLogDate } from "./dateUtils";
import { worksOfFranchise, worksOfPerson } from "./linkLogic";
import { ownedGapSummary, positionLabel, progressKindOf } from "./progressLogic";
import { MoreMenu, Screen } from "./Screen";
import { PersonImg } from "./PersonImg";
import type { DataSet, Franchise, Log, Person, Work, WorkStatus } from "./types";
import { MEDIA } from "./types";
import { SortControl, useSortPref } from "./SortControl";
import { lastLoggedMap, sortWorks } from "./sortLogic";
import type { SortPref } from "./sortLogic";

function lastLogOf(data: DataSet, workId: string): Log | null {
  let last: Log | null = null;
  for (const l of data.logs) if (l.deletedAt === null && l.workId === workId && (last === null || l.date > last.date)) last = l;
  return last;
}

/** 一覧の2行目：状態と位置（見終えた作品・見たい作品は状態だけ） */
function subText(w: Work): string {
  const pos = progressKindOf(w) !== "none" && (w.status === "active" || w.status === "paused") ? positionLabel(w) : "";
  return [workStatusWord(w, w.status), pos].filter(Boolean).join("・");
}

function WorkRows({ data, works, onOpen, originalFirst, sort }: { data: DataSet; works: Work[]; onOpen: (w: Work) => void; originalFirst?: boolean; sort: SortPref }) {
  // 並び順（v0.19.0）：既定は記録日の新しい順（記録が無いものは最後に題名順）。シリーズは原作を先に出す枠を崩さない
  const ordered = sortWorks(works, sort, { lastLogged: lastLoggedMap(data.logs) });
  const sorted = originalFirst ? [...ordered.filter((w) => w.isOriginal), ...ordered.filter((w) => !w.isOriginal)] : ordered;
  return (
    <ul className="list">
      {sorted.map((w) => {
        const last = lastLogOf(data, w.id);
        return (
          <li key={w.id}>
            <button type="button" className="list-row" onClick={() => onOpen(w)}>
              <CoverImg work={w} className="cover-thumb" />
              <span className="list-main">
                <span className="list-name">
                  {w.title}
                  {subLabel(w) && <span className="work-season"> {subLabel(w)}</span>}
                </span>
                <span className="list-sub">
                  <span className="medium-tag">{mediumTag(w)}</span>
                  {w.isOriginal && <span className="medium-tag original-tag">原作</span>}
                  {subText(w)}
                  {ownedGapSummary(w).count > 0 && <span className="gap-note">抜け {ownedGapSummary(w).count}巻</span>}
                </span>
              </span>
              {last && <span className="list-sub">{formatLogDate(last.date, last.datePrecision, undefined, true)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type Filter = "all" | WorkStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "done", label: "済み" },
  { value: "active", label: "途中" },
  { value: "wish", label: "予定" },
];

function applyFilter(works: Work[], f: Filter): Work[] {
  if (f === "all") return works;
  if (f === "active") return works.filter((w) => w.status === "active" || w.status === "paused");
  return works.filter((w) => w.status === f);
}

/** 状態で絞り込む帯（件数つき。0件の状態は出さない） */
function FilterChips({ works, value, onChange }: { works: Work[]; value: Filter; onChange: (f: Filter) => void }) {
  const shown = FILTERS.filter((f) => f.value === "all" || applyFilter(works, f.value).length > 0);
  if (shown.length <= 2) return null;
  return (
    <div className="chips scroll-chips" role="radiogroup" aria-label="状態で絞り込む">
      {shown.map((f) => (
        <button key={f.value} type="button" role="radio" aria-checked={value === f.value} className={`chip${value === f.value ? " on" : ""}`} onClick={() => onChange(f.value)}>
          {f.label} <span className="chip-count">{applyFilter(works, f.value).length}</span>
        </button>
      ))}
    </div>
  );
}

/** 親作品：同じ原作のアニメ・マンガ・映画などを1画面で見る */
export function FranchiseView({ data, franchise, onBack, onOpen, onRename, onDelete }: { data: DataSet; franchise: Franchise; onBack: () => void; onOpen: (w: Work) => void; onRename: (title: string) => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const [sortPref, setSortPref] = useSortPref("relation");
  const works = worksOfFranchise(data, franchise.id);
  return (
    <Screen
      title={franchise.title}
      onBack={onBack}
      actions={<MoreMenu open={menu} onToggle={() => setMenu(!menu)} items={[
        { label: "名前を変える", onClick: () => { const t = window.prompt("親作品の名前", franchise.title); if (t && t.trim()) onRename(t.trim()); } },
        { label: "親作品を消す（作品は残る）", danger: true, onClick: onDelete },
      ]} />}
    >
      <section className="card list-card">
        <div className="list-head">
          <h2>このシリーズの作品</h2>
          <span className="muted small">{works.length}件</span>
          {works.length > 1 && <SortControl scope="relation" value={sortPref} onChange={setSortPref} />}
        </div>
        {works.length === 0 ? <p className="muted pad">作品はありません。</p> : <WorkRows data={data} works={works} onOpen={onOpen} originalFirst sort={sortPref} />}
      </section>
    </Screen>
  );
}

/** 人物：登録した作品・公演を横断して見る */
export function PersonView({ data, person, onBack, onOpen, onRename, onSetImage, onDelete }: { data: DataSet; person: Person; onBack: () => void; onOpen: (w: Work) => void; onRename: (name: string) => void; /** 画像のURLを変える（空で外す） */ onSetImage: (url: string | null) => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const [sortPref, setSortPref] = useSortPref("relation");
  const [filter, setFilter] = useState<Filter>("all");
  const works = worksOfPerson(data, person.id);
  const shown = applyFilter(works, filter);
  const byMedium = MEDIA.map((m) => ({ label: MEDIUM_LABEL[m], n: works.filter((w) => w.medium === m).length })).filter((x) => x.n > 0);
  return (
    <Screen
      title={person.name}
      onBack={onBack}
      actions={<MoreMenu open={menu} onToggle={() => setMenu(!menu)} items={[
        { label: "名前を変える", onClick: () => { const t = window.prompt("人物の名前", person.name); if (t && t.trim()) onRename(t.trim()); } },
        { label: person.imageUrl ? "画像のURLを変える（空で外す）" : "画像のURLを入れる", onClick: () => { const t = window.prompt("人物の画像のURL（https://…）", person.imageUrl ?? ""); if (t !== null) onSetImage(t.trim() || null); } },
        { label: "人物を消す（作品は残る）", danger: true, onClick: onDelete },
      ]} />}
    >
      <section className="card person-hero">
        <PersonImg person={person} size={72} />
        <div>
          <h2 className="hero-title">{person.name}</h2>
          <p className="muted small">作品・公演 {works.length}件</p>
        </div>
      </section>
      {works.length > 0 && (
        <section className="card">
          <dl className="summary-sub person-summary">
            <div>
              <dt>済み</dt>
              <dd>{works.filter((w) => w.status === "done").length}</dd>
            </div>
            {byMedium.slice(0, 3).map((x) => (
              <div key={x.label}>
                <dt>{x.label}</dt>
                <dd>{x.n}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <FilterChips works={works} value={filter} onChange={setFilter} />
      <section className="card list-card">
        <div className="list-head">
          <h2>作品・公演</h2>
          <span className="muted small">{shown.length}件</span>
          {shown.length > 1 && <SortControl scope="relation" value={sortPref} onChange={setSortPref} />}
        </div>
        {shown.length === 0 ? <p className="muted pad">まだありません。</p> : <WorkRows data={data} works={shown} onOpen={onOpen} sort={sortPref} />}
      </section>
    </Screen>
  );
}
