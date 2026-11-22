import { CoverImg } from "./CoverImg";
import { subLabel, viaPlaceParts } from "./courLogic";
import { UNIT_LABEL, mediumTag } from "./constants";
import { formatDateShort, formatLogDate } from "./dateUtils";
import { Icon } from "./Icon";
import { LogPhotos } from "./LogPhotos";
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
        // 右上に「作品へ」「記録を足す」「編集」（v0.22.0。2026-11-22 本人「動線が右上でもいいかも」）
        <>
          <button type="button" className="text-action" onClick={onOpenWork}>作品へ</button>
          <button type="button" className="icon-btn" aria-label={addReaderLogLabel(work)} title={addReaderLogLabel(work)} onClick={onAddLog}>
            <Icon name="plus" size={21} />
          </button>
          <button type="button" className="icon-btn" aria-label="この記録を編集" title="この記録を編集" onClick={onEdit}>
            <Icon name="pencil" size={19} />
          </button>
        </>
      }
    >
      <section className="card log-reader-head">
        <CoverImg work={work} className="log-reader-cover" lazy={false} size="full" />
        <div className="log-reader-title">
          <span className="medium-tag">{mediumTag(work)}</span>
          <h2>{work.title}</h2>
          {subLabel(work) && <p className="muted">{subLabel(work)}</p>}
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
          {viaPlaceParts(log).map((t) => <span key={t}>{t}</span>)}
        </div>
        {log.rating && <div className="log-reader-rating"><Stars value={log.rating} /></div>}
        <div className="log-reader-note">
          <span className="field-label">感想・メモ</span>
          {log.note ? <p>{log.note}</p> : <p className="muted">感想・メモはありません。</p>}
        </div>
        {(log.photoIds?.length ?? 0) > 0 && <div className="log-reader-note"><span className="field-label">写真</span><LogPhotos ids={log.photoIds ?? []} /></div>}
      </section>
    </Screen>
  );
}
