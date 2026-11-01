import { useState } from "react";
import { MEDIUM_LABEL, statusWord } from "./constants";
import { formatLogDate } from "./dateUtils";
import { worksOfFranchise, worksOfPerson } from "./linkLogic";
import { positionLabel, progressKindOf } from "./progressLogic";
import { MoreMenu, Screen } from "./Screen";
import type { DataSet, Franchise, Log, Person, Work, WorkStatus } from "./types";
import { MEDIA } from "./types";

function lastLogOf(data: DataSet, workId: string): Log | null {
  let last: Log | null = null;
  for (const l of data.logs) if (l.deletedAt === null && l.workId === workId && (last === null || l.date > last.date)) last = l;
  return last;
}
const lastDateOf = (data: DataSet, workId: string): string | null => lastLogOf(data, workId)?.date ?? null;

/** 一覧の2行目：状態と位置（見終えた作品・見たい作品は状態だけ） */
function subText(w: Work): string {
  const pos = progressKindOf(w) !== "none" && (w.status === "active" || w.status === "paused") ? positionLabel(w) : "";
  return [statusWord(w.medium, w.status), pos].filter(Boolean).join("・");
}

function WorkRows({ data, works, onOpen, originalFirst }: { data: DataSet; works: Work[]; onOpen: (w: Work) => void; originalFirst?: boolean }) {
  // 楽しんだ日の新しい順（記録が無いものは最後に種類・題名の順）
  const sorted = [...works].sort((a, b) => (originalFirst ? Number(b.isOriginal) - Number(a.isOriginal) : 0) || (lastDateOf(data, b.id) ?? "").localeCompare(lastDateOf(data, a.id) ?? "") || MEDIA.indexOf(a.medium) - MEDIA.indexOf(b.medium) || a.title.localeCompare(b.title, "ja"));
  return (
    <ul className="list">
      {sorted.map((w) => {
        const last = lastLogOf(data, w.id);
        return (
          <li key={w.id}>
            <button type="button" className="list-row" onClick={() => onOpen(w)}>
              {w.coverUrl ? <img className="cover-thumb" src={w.coverUrl} alt="" loading="lazy" /> : <span className="cover-thumb cover-empty" aria-hidden="true" />}
              <span className="list-main">
                <span className="list-name">
                  {w.title}
                  {w.seasonLabel && <span className="work-season"> {w.seasonLabel}</span>}
                </span>
                <span className="list-sub">
                  <span className="medium-tag">{MEDIUM_LABEL[w.medium]}</span>
                  {w.isOriginal && <span className="medium-tag original-tag">原作</span>}
                  {subText(w)}
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
        </div>
        {works.length === 0 ? <p className="muted pad">作品はありません。</p> : <WorkRows data={data} works={works} onOpen={onOpen} originalFirst />}
      </section>
    </Screen>
  );
}

/** 人物：登録した作品・公演を横断して見る */
export function PersonView({ data, person, onBack, onOpen, onRename, onDelete }: { data: DataSet; person: Person; onBack: () => void; onOpen: (w: Work) => void; onRename: (name: string) => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
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
        { label: "人物を消す（作品は残る）", danger: true, onClick: onDelete },
      ]} />}
    >
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
        </div>
        {shown.length === 0 ? <p className="muted pad">まだありません。</p> : <WorkRows data={data} works={shown} onOpen={onOpen} />}
      </section>
    </Screen>
  );
}
