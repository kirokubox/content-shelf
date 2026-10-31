import { useState } from "react";
import { MEDIUM_LABEL, STATUS_LABEL } from "./constants";
import { formatDateShort } from "./dateUtils";
import { worksOfFranchise, worksOfPerson } from "./linkLogic";
import { positionLabel } from "./progressLogic";
import { MoreMenu, Screen } from "./Screen";
import type { DataSet, Franchise, Person, Work } from "./types";
import { MEDIA } from "./types";

function lastDateOf(data: DataSet, workId: string): string | null {
  let last: string | null = null;
  for (const l of data.logs) if (l.deletedAt === null && l.workId === workId && (last === null || l.date > last)) last = l.date;
  return last;
}

function WorkRows({ data, works, onOpen }: { data: DataSet; works: Work[]; onOpen: (w: Work) => void }) {
  // 楽しんだ日の新しい順（記録が無いものは最後に種類・題名の順）
  const sorted = [...works].sort((a, b) => (lastDateOf(data, b.id) ?? "").localeCompare(lastDateOf(data, a.id) ?? "") || MEDIA.indexOf(a.medium) - MEDIA.indexOf(b.medium) || a.title.localeCompare(b.title, "ja"));
  return (
    <ul className="list">
      {sorted.map((w) => {
        const last = lastDateOf(data, w.id);
        return (
          <li key={w.id}>
            <button type="button" className="list-row" onClick={() => onOpen(w)}>
              <span className="list-main">
                <span className="list-name">
                  {w.title}
                  {w.seasonLabel && <span className="work-season"> {w.seasonLabel}</span>}
                </span>
                <span className="list-sub">
                  <span className="medium-tag">{MEDIUM_LABEL[w.medium]}</span>
                  {[STATUS_LABEL[w.status], positionLabel(w)].filter(Boolean).join("・")}
                </span>
              </span>
              {last && <span className="list-sub">{formatDateShort(last)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
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
          <h2>この親作品の作品</h2>
          <span className="muted small">{works.length}件</span>
        </div>
        {works.length === 0 ? <p className="muted pad">作品はありません。</p> : <WorkRows data={data} works={works} onOpen={onOpen} />}
      </section>
    </Screen>
  );
}

/** 人物：登録した作品・公演を横断して見る */
export function PersonView({ data, person, onBack, onOpen, onRename, onDelete }: { data: DataSet; person: Person; onBack: () => void; onOpen: (w: Work) => void; onRename: (name: string) => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const works = worksOfPerson(data, person.id);
  const lives = works.filter((w) => w.medium === "live");
  return (
    <Screen
      title={person.name}
      onBack={onBack}
      actions={<MoreMenu open={menu} onToggle={() => setMenu(!menu)} items={[
        { label: "名前を変える", onClick: () => { const t = window.prompt("人物の名前", person.name); if (t && t.trim()) onRename(t.trim()); } },
        { label: "人物を消す（作品は残る）", danger: true, onClick: onDelete },
      ]} />}
    >
      {lives.length > 0 && <p className="muted small">LIVE・フェスに{lives.length}回行っています。</p>}
      <section className="card list-card">
        <div className="list-head">
          <h2>作品・公演</h2>
          <span className="muted small">{works.length}件</span>
        </div>
        {works.length === 0 ? <p className="muted pad">まだありません。</p> : <WorkRows data={data} works={works} onOpen={onOpen} />}
      </section>
    </Screen>
  );
}
