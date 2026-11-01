import { useState } from "react";
import { MEDIUM_LABEL, UNIT_LABEL, VIDEO_OWNED_LABEL, WEEKDAY_LABEL, doneWord, peopleLabel, statusWord, wishWord } from "./constants";
import { formatDate, formatDateShort, isoToDateKey, weekdayOf } from "./dateUtils";
import { Icon } from "./Icon";
import { availableCount, latestLabel, progressKindOf, unconsumedCount, unpurchasedCount } from "./progressLogic";
import { MoreMenu, Screen, Stars } from "./Screen";
import type { Franchise, Log, Person, Work, WorkStatus } from "./types";
import { rangesText } from "./WorkEditor";

const OWNED_LABEL = { paper: "紙", kindle: "Kindle", jump_plus: "ジャンプ＋" } as const;
const PLACE_LABEL = { home: "自宅", parents_home: "実家", both: "自宅と実家", unknown: "場所不明" } as const;

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
  onBought: () => void;
  onNewVolume: () => void;
  onStartAgain: () => void;
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

export function WorkDetail({ work, logs, franchise, people, onOpenFranchise, onOpenPerson, today, onBack, onEdit, onStep, onAddLog, onEditLog, onSetStatus, onDelete, onBought, onNewVolume, onStartAgain }: Props) {
  const unpurchased = unpurchasedCount(work);
  const [menu, setMenu] = useState(false);
  const kind = progressKindOf(work);
  const unconsumed = unconsumedCount(work, today);
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const statusItems: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (kind !== "none") {
    if (work.status === "done") statusItems.push({ label: work.medium === "manga" ? "もう一度読む（最初から）" : "もう一度見る（最初から）", onClick: onStartAgain });
    if (work.status !== "active") statusItems.push({ label: work.status === "done" ? "続きに戻す（今の位置のまま）" : "進行中にする", onClick: () => onSetStatus("active") });
    if (work.status === "active") statusItems.push({ label: "休止にする", onClick: () => onSetStatus("paused") });
    if (work.status !== "done") statusItems.push({ label: work.medium === "manga" ? "読み終えた（記録へ）" : "見終えた（記録へ）", onClick: () => onSetStatus("done") });
  } else {
    if (work.status === "wish") statusItems.push({ label: `${doneWord(work.medium)}にする`, onClick: () => onSetStatus("done") });
    else statusItems.push({ label: `${wishWord(work.medium)}に戻す`, onClick: () => onSetStatus("wish") });
  }
  if (work.status !== "wish" && kind !== "none") statusItems.push({ label: `${statusWord(work.medium, "wish")}にする`, onClick: () => onSetStatus("wish") });
  statusItems.push({ label: "作品を削除", danger: true, onClick: onDelete });

  const schedule = work.schedule;
  const available = availableCount(work, today);
  const unit = UNIT_LABEL[kind];
  // 続きの位置：最後まで見た作品で位置が分からないとき（出演作の取り込みなど）は出さない
  const showProgress = (kind === "episode" || kind === "volume") && !(work.status === "done" && work.progress === null);
  const pct = available ? Math.min(100, Math.round(((work.progress ?? 0) / available) * 100)) : 0;
  const ownedText = work.owned?.medium ? OWNED_LABEL[work.owned.medium] + (work.owned.medium === "paper" && work.owned.place ? `（${PLACE_LABEL[work.owned.place]}）` : "") : null;
  const doneAt = kind !== "none" && work.status === "done" && work.completedAt ? work.completedAt : null;
  const hasInfo = Boolean(schedule || work.buying || work.owned?.ranges.length || ownedText || work.edition || work.videoOwned || doneAt || people.length > 0 || work.memo);
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
        <div className="hero">
          {work.coverUrl ? <img className="hero-cover" src={work.coverUrl} alt="" /> : <div className="hero-cover hero-cover-empty" aria-hidden="true">{MEDIUM_LABEL[work.medium].slice(0, 4)}</div>}
          <div className="hero-body">
            <h2 className="hero-title">{work.title}</h2>
            {work.seasonLabel && <p className="hero-sub">{work.seasonLabel}</p>}
            <div className="hero-tags">
              <span className="medium-tag">{MEDIUM_LABEL[work.medium]}</span>
              <span className={`status-pill s-${work.status}`}>{statusWord(work.medium, work.status)}</span>
            </div>
            {franchise && (
              <button type="button" className="hero-link" onClick={() => onOpenFranchise(franchise)}>
                シリーズ：{franchise.title} <Icon name="chevron-right" size={14} />
              </button>
            )}
          </div>
        </div>

        {showProgress && (
          <div className="progress-box">
            <div className="progress-line">
              <span className="progress-now">
                {work.progress ? <><strong>{work.progress}</strong>{kind === "episode" ? "話まで見た" : "巻まで読んだ"}</> : kind === "episode" ? "まだ見ていない" : "まだ読んでいない"}
              </span>
              {unconsumed !== null && unconsumed > 0 && <span className="progress-left">あと{unconsumed}{unit}</span>}
            </div>
            {available !== null && available > 0 && (
              <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={available} aria-valuenow={work.progress ?? 0}>
                <span style={{ width: `${pct}%` }} />
              </div>
            )}
            {latestLabel(work, today) && <p className="progress-note">{latestLabel(work, today)}</p>}
          </div>
        )}
        {kind === "issue" && (
          <div className="progress-box">
            <div className="progress-line">
              <span className="progress-now">{work.readThrough ? `${formatDate(work.readThrough, today)}発売の号まで読んだ` : "まだ読んでいない"}</span>
              {unconsumed !== null && unconsumed > 0 && <span className="progress-left">あと{unconsumed}号</span>}
            </div>
          </div>
        )}

        <div className="actions">
          {kind !== "none" && work.status !== "done" && (
            <button type="button" className="primary-btn" onClick={() => onStep(work)}>
              <Icon name="plus" size={18} /> 次の{unit}を記録
            </button>
          )}
          {kind !== "none" && work.status !== "done" && (
            <button type="button" className="secondary-btn" onClick={() => onAddLog("progress")}>
              日付を選んで記録
            </button>
          )}
          {work.medium === "manga" && work.buying && (
            <>
              <button type="button" className="secondary-btn" onClick={onNewVolume}>新刊が出た</button>
              {unpurchased > 0 && <button type="button" className="secondary-btn" onClick={onBought}>1巻買った</button>}
            </>
          )}
          <button type="button" className={kind === "none" ? "primary-btn" : "secondary-btn"} onClick={() => onAddLog("view")}>
            {kind === "none" ? `${doneWord(work.medium)}記録を追加` : "感想を残す"}
          </button>
        </div>
      </section>

      {hasInfo && (
      <section className="card">
        <dl className="rows">
          <Row label={kind === "issue" ? "発売" : "放送"} value={schedule ? `毎週${WEEKDAY_LABEL[weekdayOf(schedule.firstDate)]}曜日` : null} />
          <Row label="休みの週" value={schedule && schedule.skipDates.length > 0 ? [...schedule.skipDates].sort().map((x) => formatDateShort(x)).join("、") : null} />
          <Row label="新刊" value={work.buying ? (unpurchased > 0 ? `買う・未購入 ${unpurchased}巻` : "買う・買い終わっている") : null} />
          <Row label="持っている巻" value={work.owned?.ranges.length ? `${rangesText(work.owned.ranges)}巻` : null} />
          <Row label="形" value={ownedText} />
          <Row label="版" value={work.edition} />
          <Row label="映像" value={work.videoOwned ? `${VIDEO_OWNED_LABEL[work.videoOwned]}を持っている` : null} />
          <Row label={work.medium === "manga" ? "読み終えた日" : "見終えた日"} value={doneAt ? formatDate(isoToDateKey(doneAt), today) : null} />
          <Row
            label={peopleLabel(work.medium)}
            value={
              people.length > 0 ? (
                <span className="row-chips">
                  {people.map((p) => (
                    <button key={p.id} type="button" className="chip mini" onClick={() => onOpenPerson(p)}>{p.name}</button>
                  ))}
                </span>
              ) : null
            }
          />
        </dl>
        {work.memo && (
          <div className="detail-block">
            <span className="field-label">メモ</span>
            <p className="memo-text">{work.memo}</p>
          </div>
        )}
      </section>
      )}

      {work.setlist && (
        <section className="card">
          <h2 className="card-title">セットリスト</h2>
          <ol className="setlist">{work.setlist.split(/\n+/).filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}</ol>
        </section>
      )}

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
                      {l.position ? `　第${l.position}${unit || "回"}` : ""}
                      {l.issueDate ? `　${formatDateShort(l.issueDate)}発売の号` : ""}
                    </span>
                    {l.place && <span className="list-sub">{l.place}</span>}
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
