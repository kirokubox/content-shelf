import { useMemo, useState } from "react";
import { MEDIUM_LABEL, STATUS_LABEL, doneWord } from "./constants";
import { formatDate, formatDateShort, isoToDateKey } from "./dateUtils";
import { Icon } from "./Icon";
import { Stars } from "./Screen";
import { countUnit, completedWorks, monthlyCounts, summarize } from "./summaryLogic";
import type { Period } from "./summaryLogic";
import type { DataSet, Log, Medium, Work, WorkStatus } from "./types";
import { MEDIA } from "./types";
import { WorkCard } from "./WorkCard";

interface CardHandlers {
  today: string;
  onOpen: (work: Work) => void;
  onStep: (work: Work) => void;
  onStepWithDate: (work: Work) => void;
}

/** 記録タブ・ホームの下段に出す1件（見た記録、または記録へ移った作品） */
export interface RecordItem {
  key: string;
  date: string;
  work: Work;
  log: Log | null;
}

export function buildRecordItems(data: DataSet): RecordItem[] {
  const works = new Map(data.works.filter((w) => w.deletedAt === null).map((w) => [w.id, w]));
  const items: RecordItem[] = [];
  for (const l of data.logs) {
    if (l.deletedAt !== null || l.kind !== "view") continue;
    const w = works.get(l.workId);
    if (w) items.push({ key: `log-${l.id}`, date: l.date, work: w, log: l });
  }
  const withView = new Set(items.map((i) => i.work.id));
  for (const w of works.values()) {
    // 映画・小説のように見た記録があるものは記録の方で出す。続きもの（アニメ・マンガ）は完了した日で1件
    if (w.status === "done" && w.completedAt && !withView.has(w.id)) items.push({ key: `done-${w.id}`, date: isoToDateKey(w.completedAt), work: w, log: null });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
}

function Empty({ text, onAdd }: { text: string; onAdd?: () => void }) {
  return (
    <div className="empty">
      <p>{text}</p>
      {onAdd && (
        <button type="button" className="secondary-btn" onClick={onAdd}>
          <Icon name="plus" size={18} /> 作品を登録する
        </button>
      )}
    </div>
  );
}

function RecordRow({ item, onOpen }: { item: RecordItem; onOpen: (w: Work) => void }) {
  const { work, log } = item;
  return (
    <li>
      <button type="button" className="list-row" onClick={() => onOpen(work)}>
        <span className="list-main">
          <span className="list-name">
            {work.title}
            {work.seasonLabel && <span className="work-season"> {work.seasonLabel}</span>}
          </span>
          <span className="list-sub">
            <span className="medium-tag">{MEDIUM_LABEL[work.medium]}</span>
            {log ? [log.place, log.position ? `${log.position}巻` : ""].filter(Boolean).join("・") || doneWord(work.medium) : "最後まで見た・読んだ"}
          </span>
          {log?.note && <span className="list-sub wrap note-excerpt">{log.note}</span>}
        </span>
        <span className="record-side">
          <span className="list-sub">{formatDateShort(item.date)}</span>
          {log?.rating ? <Stars value={log.rating} /> : null}
        </span>
      </button>
    </li>
  );
}

export function HomeView({ data, handlers, onAdd, onGoContinue, onGoRecords }: { data: DataSet; handlers: CardHandlers; onAdd: () => void; onGoContinue: () => void; onGoRecords: () => void }) {
  const recent = useMemo(
    () => data.works.filter((w) => w.deletedAt === null && w.status === "active").sort((a, b) => b.touchedAt.localeCompare(a.touchedAt)).slice(0, 5),
    [data.works],
  );
  const records = useMemo(() => buildRecordItems(data).slice(0, 5), [data]);
  if (data.works.filter((w) => w.deletedAt === null).length === 0) {
    return (
      <section className="card">
        <h2>ようこそ</h2>
        <p className="muted">アニメ・週刊誌・マンガの「どこまで見たか」と、映画・小説の「いつ見たか・感想」をためていく棚です。右下の＋から作品を登録してください。</p>
        <p className="muted small">データはこの端末の中だけに保存されます。設定からバックアップを保存できます。</p>
        <Empty text="" onAdd={onAdd} />
      </section>
    );
  }
  return (
    <>
      <section className="card list-card">
        <button type="button" className="list-head link-head" onClick={onGoContinue}>
          <h2>最近の続き</h2>
          <Icon name="chevron-right" size={18} />
        </button>
        {recent.length === 0 ? (
          <p className="muted pad">進行中の作品はありません。</p>
        ) : (
          <ul className="work-list">
            {recent.map((w) => (
              <WorkCard key={w.id} work={w} {...handlers} />
            ))}
          </ul>
        )}
      </section>
      <section className="card list-card">
        <button type="button" className="list-head link-head" onClick={onGoRecords}>
          <h2>最近の作品・体験</h2>
          <Icon name="chevron-right" size={18} />
        </button>
        {records.length === 0 ? (
          <p className="muted pad">見た・読んだ記録はまだありません。</p>
        ) : (
          <ul className="list">
            {records.map((r) => (
              <RecordRow key={r.key} item={r} onOpen={handlers.onOpen} />
            ))}
          </ul>
        )}
      </section>
      <div className="fab-space" />
    </>
  );
}

const CONTINUE_STATUSES: WorkStatus[] = ["active", "paused", "wish"];

function MediumChips({ media, value, onChange }: { media: Medium[]; value: Medium | null; onChange: (m: Medium | null) => void }) {
  if (media.length < 2) return null;
  return (
    <div className="chips scroll-chips">
      <button type="button" className={`chip${value === null ? " on" : ""}`} onClick={() => onChange(null)}>
        すべて
      </button>
      {media.map((m) => (
        <button key={m} type="button" className={`chip${value === m ? " on" : ""}`} onClick={() => onChange(m)}>
          {MEDIUM_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

export function ContinueView({ data, handlers, onAdd }: { data: DataSet; handlers: CardHandlers; onAdd: () => void }) {
  const [status, setStatus] = useState<WorkStatus>("active");
  const [medium, setMedium] = useState<Medium | null>(null);
  const inStatus = data.works.filter((w) => w.deletedAt === null && w.status === status);
  const media = MEDIA.filter((m) => inStatus.some((w) => w.medium === m));
  const list = inStatus.filter((w) => medium === null || w.medium === medium).sort((a, b) => b.touchedAt.localeCompare(a.touchedAt));
  return (
    <>
      <div className="segmented" role="tablist">
        {CONTINUE_STATUSES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={s === status} className={`seg${s === status ? " on" : ""}`} onClick={() => { setStatus(s); setMedium(null); }}>
            {s === "wish" ? "見たい" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <MediumChips media={media} value={medium} onChange={setMedium} />
      {list.length === 0 ? (
        <Empty text={status === "active" ? "進行中の作品はありません。" : status === "paused" ? "休止中の作品はありません。" : "見たい・読みたい作品はありません。"} onAdd={status === "paused" ? undefined : onAdd} />
      ) : (
        <section className="card list-card">
          <ul className="work-list">
            {list.map((w) => (
              <WorkCard key={w.id} work={w} {...handlers} />
            ))}
          </ul>
        </section>
      )}
      <div className="fab-space" />
    </>
  );
}

export function RecordsView({ data, onOpen }: { data: DataSet; onOpen: (w: Work) => void }) {
  const [mode, setMode] = useState<"list" | "grid">("list");
  const [medium, setMedium] = useState<Medium | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const all = useMemo(() => buildRecordItems(data), [data]);
  const media = MEDIA.filter((m) => all.some((i) => i.work.medium === m));
  const years = Array.from(new Set(all.map((i) => i.date.slice(0, 4)))).sort().reverse();
  const items = all.filter((i) => (medium === null || i.work.medium === medium) && (year === null || i.date.startsWith(year)));
  if (all.length === 0) return <Empty text="見た・読んだ記録はまだありません。映画・小説を登録するか、続きの作品を最後まで見ると、ここにたまります。" />;
  return (
    <>
      <MediumChips media={media} value={medium} onChange={setMedium} />
      <div className="records-tools">
        <p className="muted small count-line">{items.length}件</p>
        <div className="records-right">
          {years.length > 1 && (
            <select className="text-input year-select" value={year ?? ""} onChange={(e) => setYear(e.target.value || null)} aria-label="年">
              <option value="">すべての年</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
          )}
          <button type="button" className="icon-btn" aria-label={mode === "list" ? "並べて表示" : "一覧で表示"} onClick={() => setMode(mode === "list" ? "grid" : "list")}>
            <Icon name={mode === "list" ? "grid" : "list"} size={20} />
          </button>
        </div>
      </div>
      {mode === "list" ? (
        <section className="card list-card">
          <ul className="list">
            {items.map((r) => (
              <RecordRow key={r.key} item={r} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ) : (
        <ul className="record-grid">
          {items.map((r) => (
            <li key={r.key}>
              <button type="button" className="grid-tile" onClick={() => onOpen(r.work)}>
                {r.work.coverUrl ? <img src={r.work.coverUrl} alt="" loading="lazy" /> : <span className="tile-title">{r.work.title}</span>}
                <span className="tile-date">{formatDateShort(r.date)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "month", label: "今月" },
  { id: "year", label: "今年" },
  { id: "all", label: "累計" },
];

export function SummaryView({ data, today }: { data: DataSet; today: string }) {
  const [period, setPeriod] = useState<Period>("month");
  const rows = summarize(data, period, today);
  const done = completedWorks(data, period, today);
  const months = monthlyCounts(data, today.slice(0, 4));
  const max = Math.max(1, ...months);
  return (
    <>
      <div className="segmented">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" className={`seg${p.id === period ? " on" : ""}`} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <section className="card">
        <h2>{PERIODS.find((p) => p.id === period)!.label}の記録</h2>
        {rows.length === 0 ? (
          <p className="muted">この期間の記録はありません。</p>
        ) : (
          <dl className="rows">
            {rows.map((r) => (
              <div className="row" key={r.medium}>
                <dt>{MEDIUM_LABEL[r.medium]}</dt>
                <dd>
                  {r.works}作品・{r.count}
                  {countUnit(r.medium)}
                </dd>
              </div>
            ))}
            <div className="row">
              <dt>最後まで見た・読んだ</dt>
              <dd>{done}作品</dd>
            </div>
          </dl>
        )}
        <p className="muted small">作品数は、その期間に記録がある作品の数です。回数は話・巻・号・鑑賞の数を数えています。</p>
      </section>
      <section className="card">
        <h2>{today.slice(0, 4)}年の月ごとの記録</h2>
        <div className="bars" role="img" aria-label="月ごとの記録数">
          {months.map((n, i) => (
            <div className="bar-col" key={i}>
              <span className="bar-num">{n > 0 ? n : ""}</span>
              <span className="bar" style={{ height: `${(n / max) * 100}%` }} />
              <span className="bar-label">{i + 1}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="muted small center">{formatDate(today, today)}時点</p>
    </>
  );
}
