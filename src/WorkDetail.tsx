import { useState } from "react";
import { MEDIUM_LABEL, STATUS_LABEL, UNIT_LABEL, WEEKDAY_LABEL, doneWord, wishWord } from "./constants";
import { formatDate, formatDateShort, isoToDateKey, weekdayOf } from "./dateUtils";
import { Icon } from "./Icon";
import { latestLabel, positionLabel, progressKindOf, unconsumedCount } from "./progressLogic";
import { MoreMenu, Screen, Stars } from "./Screen";
import type { Franchise, Log, Person, Work, WorkStatus } from "./types";
import { rangesText } from "./WorkEditor";

const OWNED_LABEL = { paper: "紙", kindle: "Kindle", jump_plus: "ジャンプ＋" } as const;
const PLACE_LABEL = { home: "自宅", parents_home: "実家", both: "自宅と実家", unknown: "分からない" } as const;

interface Props {
  work: Work;
  logs: Log[];
  franchise: Franchise | null;
  people: Person[];
  onOpenFranchise: (f: Franchise) => void;
  onOpenPerson: (p: Person) => void;
  today: string;
  onBack: () => void;
  onEdit: () => void;
  onStep: (work: Work) => void;
  onAddLog: (kind: Log["kind"]) => void;
  onEditLog: (log: Log) => void;
  onSetStatus: (status: WorkStatus) => void;
  onDelete: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === "" || value === undefined) return null;
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function WorkDetail({ work, logs, franchise, people, onOpenFranchise, onOpenPerson, today, onBack, onEdit, onStep, onAddLog, onEditLog, onSetStatus, onDelete }: Props) {
  const [menu, setMenu] = useState(false);
  const kind = progressKindOf(work);
  const unconsumed = unconsumedCount(work, today);
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const statusItems: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (kind !== "none") {
    if (work.status !== "active") statusItems.push({ label: work.status === "done" ? "続きに戻す" : "進行中にする", onClick: () => onSetStatus("active") });
    if (work.status === "active") statusItems.push({ label: "休止にする", onClick: () => onSetStatus("paused") });
    if (work.status !== "done") statusItems.push({ label: "最後まで見た・読んだ（記録へ）", onClick: () => onSetStatus("done") });
  } else {
    if (work.status === "wish") statusItems.push({ label: `${doneWord(work.medium)}にする`, onClick: () => onSetStatus("done") });
    else statusItems.push({ label: `${wishWord(work.medium)}に戻す`, onClick: () => onSetStatus("wish") });
  }
  if (work.status !== "wish" && kind !== "none") statusItems.push({ label: "見たい・読みたいにする", onClick: () => onSetStatus("wish") });
  statusItems.push({ label: "作品を削除", danger: true, onClick: onDelete });

  const schedule = work.schedule;
  const statusText = kind === "none" ? (work.status === "wish" ? wishWord(work.medium) : doneWord(work.medium)) : work.status === "done" ? "最後まで見た・読んだ" : STATUS_LABEL[work.status];
  return (
    <Screen
      title={work.title}
      onBack={onBack}
      actions={
        <>
          <button type="button" className="icon-btn" aria-label="編集" onClick={onEdit}>
            <Icon name="pencil" size={20} />
          </button>
          <MoreMenu open={menu} onToggle={() => setMenu(!menu)} items={statusItems} />
        </>
      }
    >
      <section className="card">
        <dl className="rows">
          <Row label="種類" value={MEDIUM_LABEL[work.medium]} />
          <Row label="シーズン・編" value={work.seasonLabel} />
          <Row label="状態" value={statusText} />
          <Row label="どこまで" value={kind === "issue" ? (work.readThrough ? `${formatDate(work.readThrough, today)}発売の号まで` : "まだ読んでいない") : positionLabel(work)} />
          <Row label="最新" value={latestLabel(work, today)} />
          <Row label="未消化" value={unconsumed !== null ? `${unconsumed}${UNIT_LABEL[kind]}` : null} />
          <Row label={kind === "issue" ? "発売" : "放送"} value={schedule ? `毎週${WEEKDAY_LABEL[weekdayOf(schedule.firstDate)]}曜日` : null} />
          <Row label="休みの週" value={schedule && schedule.skipDates.length > 0 ? [...schedule.skipDates].sort().map((x) => formatDateShort(x)).join("、") : null} />
          <Row label="持っている巻" value={work.owned?.ranges.length ? `${rangesText(work.owned.ranges)}巻` : null} />
          <Row label="形" value={work.owned?.medium ? OWNED_LABEL[work.owned.medium] : null} />
          <Row label="置き場所" value={work.owned?.medium === "paper" && work.owned.place ? PLACE_LABEL[work.owned.place] : null} />
          <Row label="版" value={work.edition} />
          <Row label="記録へ移った日" value={work.status === "done" && work.completedAt ? formatDate(isoToDateKey(work.completedAt), today) : null} />
          <Row label="読み仮名" value={work.kana} />
          <Row label="親作品" value={franchise ? <button type="button" className="link-btn" onClick={() => onOpenFranchise(franchise)}>{franchise.title}</button> : null} />
        </dl>
        {people.length > 0 && (
          <div className="chips detail-people" aria-label={work.medium === "live" ? "出演者" : "人物"}>
            {people.map((p) => (
              <button key={p.id} type="button" className="chip" onClick={() => onOpenPerson(p)}>{p.name}</button>
            ))}
          </div>
        )}
        {work.setlist && (
          <div className="setlist">
            <span className="field-label">セットリスト</span>
            <ol>{work.setlist.split(/\n+/).filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}</ol>
          </div>
        )}
        {work.memo && <p className="memo-text">{work.memo}</p>}
        {work.legacyNote && <p className="muted small">旧アプリのメモ：{work.legacyNote}</p>}
        <div className="actions">
          {kind !== "none" && work.status !== "done" && (
            <button type="button" className="primary-btn" onClick={() => onStep(work)}>
              <Icon name="plus" size={18} /> 次の{UNIT_LABEL[kind]}を記録
            </button>
          )}
          {kind !== "none" && work.status !== "done" && (
            <button type="button" className="secondary-btn" onClick={() => onAddLog("progress")}>
              日付を選んで記録
            </button>
          )}
          <button type="button" className={kind === "none" ? "primary-btn" : "secondary-btn"} onClick={() => onAddLog("view")}>
            {kind === "none" ? `${doneWord(work.medium)}記録を追加` : "感想を残す"}
          </button>
        </div>
      </section>
      <section className="card list-card">
        <div className="list-head">
          <h2>記録</h2>
          <span className="muted small">{sorted.length}件</span>
        </div>
        {sorted.length === 0 ? (
          <p className="muted pad">まだ記録はありません。</p>
        ) : (
          <ul className="list">
            {sorted.map((l) => (
              <li key={l.id}>
                <button type="button" className="list-row" onClick={() => onEditLog(l)}>
                  <span className="list-main">
                    <span className="list-name">
                      {formatDate(l.date, today)}
                      {l.position ? `　第${l.position}${UNIT_LABEL[kind] || "回"}` : ""}
                      {l.issueDate ? `　${formatDateShort(l.issueDate)}発売の号` : ""}
                    </span>
                    {(l.place || l.source) && <span className="list-sub">{[l.place, l.source ? `${l.source}から取り込み` : ""].filter(Boolean).join("・")}</span>}
                    {l.note && <span className="list-sub wrap note-excerpt">{l.note}</span>}
                  </span>
                  {l.rating ? <Stars value={l.rating} /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Screen>
  );
}
