import { CoverImg } from "./CoverImg";
import { UNIT_LABEL, mediumTag } from "./constants";
import { formatDateShort, formatLogDate } from "./dateUtils";
import { Icon } from "./Icon";
import { addReaderLogLabel, readerPosition } from "./logReaderLogic";
import { progressKindOf } from "./progressLogic";
import { Screen, Stars } from "./Screen";
import type { Log, Work } from "./types";

interface Props {
  work: Work;
  log: Log;
  logs: Log[];
  today: string;
  onBack: () => void;
  onEdit: () => void;
  onAddLog: () => void;
  onOpenWork: () => void;
  onOpenLog: (log: Log) => void;
}

export function LogDetail({ work, log, logs, today, onBack, onEdit, onAddLog, onOpenWork, onOpenLog }: Props) {
  const kind = progressKindOf(work);
  const position = log.position !== null ? `第${log.position}${UNIT_LABEL[kind] || "回"}` : "";
  const reader = readerPosition(logs, work.id, log.id);
  return (
    <Screen
      title="記録を読む"
      onBack={onBack}
      actions={
        <button type="button" className="text-action" onClick={onEdit}>
          <Icon name="pencil" size={17} /> 編集
        </button>
      }
    >
      <section className="card log-reader-head">
        <CoverImg work={work} className="log-reader-cover" lazy={false} size="full" fallback={<div className="log-reader-cover empty-cover">{work.title}</div>} />
        <div className="log-reader-title">
          <span className="medium-tag">{mediumTag(work)}</span>
          <h2>{work.title}</h2>
          {work.seasonLabel && <p className="muted">{work.seasonLabel}</p>}
        </div>
      </section>
      <section className="card">
        {reader.total > 1 && (
          <div className="log-reader-nav">
            <span className="muted small">{reader.total}件中 {reader.index + 1}件目</span>
            <div>
              <button type="button" className="secondary-btn" disabled={!reader.previous} onClick={() => reader.previous && onOpenLog(reader.previous)}>前の記録</button>
              <button type="button" className="secondary-btn" disabled={!reader.next} onClick={() => reader.next && onOpenLog(reader.next)}>次の記録</button>
            </div>
          </div>
        )}
        <div className="log-reader-meta">
          <strong>{formatLogDate(log.date, log.datePrecision, today)}</strong>
          {position && <span>{position}</span>}
          {log.issueDate && <span>{formatDateShort(log.issueDate)}発売の号</span>}
          {log.place && <span>{log.place}</span>}
        </div>
        {log.rating && <div className="log-reader-rating"><Stars value={log.rating} /></div>}
        <div className="log-reader-note">
          <span className="field-label">感想・メモ</span>
          {log.note ? <p>{log.note}</p> : <p className="muted">感想・メモはありません。</p>}
        </div>
      </section>
      <section className="card log-reader-actions">
        <button type="button" className="primary-btn" onClick={onAddLog}>{addReaderLogLabel(work)}</button>
        <button type="button" className="secondary-btn" onClick={onOpenWork}>作品を開く</button>
      </section>
    </Screen>
  );
}
