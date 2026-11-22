import { useMemo, useState } from "react";
import { CoverImg } from "./CoverImg";
import { MEDIUM_LABEL } from "./constants";
import { buildCoverSheet } from "./coverSheet";
import { downloadBlob } from "./fileUtils";
import { Icon } from "./Icon";
import { Screen, Stars } from "./Screen";
import { countUnit, recordedYears, yearSummary } from "./summaryLogic";
import type { DataSet, Work } from "./types";

interface Props {
  data: DataSet;
  year: string;
  onChangeYear: (year: string) => void;
  onOpenMonth: (month: string) => void;
  onBack: () => void;
  onOpen: (work: Work) => void;
}

export function YearSummaryView({ data, year, onChangeYear, onOpenMonth, onBack, onOpen }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const summary = useMemo(() => yearSummary(data, year), [data, year]);
  const years = useMemo(() => recordedYears(data), [data]);
  const workOf = useMemo(() => new Map(data.works.map((w) => [w.id, w])), [data.works]);
  const works = summary.works.map((m) => workOf.get(m.workId)).filter((w): w is Work => !!w);
  const pastYears = years.filter((value) => value < year);
  const previousYear = pastYears[pastYears.length - 1];
  const nextYear = years.find((value) => value > year);
  const label = `${Number(year)}年`;

  const saveImage = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await buildCoverSheet(label, works, 60);
      downloadBlob(`content-shelf-${year}.png`, result.blob);
      const notes = [`${result.drawn}作品の表紙を画像にしました。`];
      if (result.failed > 0) notes.push(`${result.failed}作品は表紙を読み込めず、題名の表紙にしました。`);
      if (result.omitted > 0) notes.push(`ほか${result.omitted}作品は画像に入れていません。`);
      setMessage(notes.join(""));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "画像を作れませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="年のまとめ" onBack={onBack}>
      <div className="month-nav">
        <button type="button" className="icon-btn" aria-label="前の年" disabled={!previousYear} onClick={() => previousYear && onChangeYear(previousYear)}><Icon name="chevron-left" size={22} /></button>
        <h2 className="month-nav-label">{label}</h2>
        <button type="button" className="icon-btn" aria-label="次の年" disabled={!nextYear} onClick={() => nextYear && onChangeYear(nextYear)}><Icon name="chevron-right" size={22} /></button>
      </div>
      {works.length === 0 ? (
        <section className="card"><p className="muted">この年の記録はありません。</p></section>
      ) : (
        <>
          <section className="card"><dl className="summary-sub month-totals">
            <div><dt>作品</dt><dd>{works.length}</dd></div>
            <div><dt>記録</dt><dd>{summary.totalLogs}</dd></div>
            <div><dt>最後まで</dt><dd>{summary.completed}</dd></div>
          </dl></section>
          <section className="card">
            <h2>この年の作品</h2>
            <ul className="month-grid">{works.map((work) => <li key={work.id}><button type="button" className="month-cover" aria-label={work.title} onClick={() => onOpen(work)}><CoverImg work={work} className="month-cover-image" /></button></li>)}</ul>
            <button type="button" className="secondary-btn month-save" onClick={() => void saveImage()} disabled={busy}><Icon name="download" size={18} /> {busy ? "画像を作っています…" : "表紙の並びを画像で保存"}</button>
            {message && <p className="muted small" role="status">{message}</p>}
            <p className="muted small">画像に入るのは「{label}」と先頭60作品までの表紙です。表紙が無い作品は題名の表紙で入ります。{works.length > 60 && `ほか${works.length - 60}作品は画像に入りません。`}</p>
          </section>
          {summary.topRated.length > 0 && <section className="card"><h2>星が高かったもの</h2><ul className="month-top">{summary.topRated.map((m) => {
            const work = workOf.get(m.workId);
            return work ? <li key={m.workId}><button type="button" className="month-top-row" onClick={() => onOpen(work)}><span className="month-top-title">{work.title}</span><Stars value={m.rating} /></button></li> : null;
          })}</ul></section>}
          <section className="card"><h2>種類ごと</h2><dl className="rows">{summary.byMedium.map((row) => <div className="row" key={row.medium}><dt>{MEDIUM_LABEL[row.medium]}</dt><dd>{row.works}作品・{row.count}{countUnit(row.medium)}</dd></div>)}</dl></section>
          {summary.busiestMonth && <section className="card"><h2>いちばん記録が多かった月</h2><button type="button" className="month-top-row" onClick={() => onOpenMonth(summary.busiestMonth!.month)}><span>{Number(summary.busiestMonth.month.slice(5, 7))}月</span><span>{summary.busiestMonth.count}件</span></button></section>}
        </>
      )}
    </Screen>
  );
}
