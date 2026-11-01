import { useState } from "react";
import { BottomSheet } from "./BottomSheet";
import { doneWord } from "./constants";
import { dateKeyFromInput, inputFromDateKey, nowIso } from "./dateUtils";
import { DateField, PlaceField, hasPlace } from "./formParts";
import type { PrecisionChoice } from "./formParts";
import { progressKindOf } from "./progressLogic";
import { Stars } from "./Screen";
import type { DatePrecision, Log, Work } from "./types";
import { newLog } from "./workFactory";

interface Props {
  work: Work;
  /** null＝新しい記録 */
  log: Log | null;
  today: string;
  /** 新しい記録の種類（＋1の長押しなら progress） */
  newKind: Log["kind"];
  onClose: () => void;
  onSave: (log: Log) => void;
  onDelete?: (log: Log) => void;
}

/** 記録1件の入力・編集（日付・第何話・感想・星・場所） */
export function LogSheet({ work, log, today, newKind, onClose, onSave, onDelete }: Props) {
  const kind = progressKindOf(work);
  const isProgress = (log?.kind ?? newKind) === "progress";
  const defaultPosition = isProgress && (kind === "episode" || kind === "volume") ? String((work.progress ?? 0) + 1) : "";
  const initialPrecision: DatePrecision = log?.datePrecision ?? "day";
  const [precision, setPrecision] = useState<DatePrecision>(initialPrecision);
  const [dateText, setDateText] = useState(inputFromDateKey(log?.date ?? today, initialPrecision));
  const [position, setPosition] = useState(log?.position?.toString() ?? (log ? "" : defaultPosition));
  const [note, setNote] = useState(log?.note ?? "");
  const [rating, setRating] = useState<number | null>(log?.rating ?? null);
  const [place, setPlace] = useState(log?.place ?? "");
  const [error, setError] = useState("");
  const showPosition = kind === "episode" || kind === "volume";

  const save = () => {
    const date = dateKeyFromInput(dateText, precision);
    if (!date) return setError(precision === "year" ? "年を4桁で入れてください（例：2015）" : "日付を選んでください");
    if (date > today) return setError("先の日付は入れられません");
    const posText = position.trim().normalize("NFKC");
    const pos = posText ? Number(posText) : null;
    if (pos !== null && (!Number.isInteger(pos) || pos < 1)) return setError("第何話・何巻は1以上の整数で入れてください");
    const now = nowIso();
    const base = log ?? newLog({ workId: work.id, kind: newKind, date }, now);
    onSave({ ...base, date, datePrecision: precision, position: showPosition ? pos : base.position, note: note.trim(), rating, place: place.trim(), updatedAt: now });
  };

  const title = log ? "記録を編集" : isProgress ? `${work.title}：日付を選んで記録` : `${doneWord(work.medium)}記録を追加`;
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="form compact">
        <div className="two-col">
          <DateField label="日付" value={dateText} precision={precision} today={today} onChange={(v, p: PrecisionChoice) => { setDateText(v); if (p !== "none") setPrecision(p); }} />
          {showPosition ? (
            <label className="field">
              <span className="field-label">{kind === "episode" ? "第何話" : "何巻"}</span>
              <input className="text-input" inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value)} />
            </label>
          ) : !isProgress && hasPlace(work.medium) && work.medium !== "movie" ? (
            <PlaceField medium={work.medium} value={place} onChange={setPlace} />
          ) : <span />}
        </div>
        {!isProgress && work.medium === "movie" && <PlaceField medium="movie" value={place} onChange={setPlace} />}
        {isProgress && showPosition && !log && <span className="field-hint">保存すると、ここまで見た・読んだことになります。</span>}
        {!isProgress && (
          <div className="inline-row">
            <span className="field-label">星</span>
            <Stars value={rating} onChange={setRating} />
          </div>
        )}
        <textarea className="text-input note-input" rows={isProgress ? 2 : 4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="感想（任意）" aria-label="感想" />
        {error && <p className="field-error">{error}</p>}
      </div>
      <div className="sheet-actions">
        {log && onDelete && (
          <button type="button" className="danger-btn push-left" onClick={() => onDelete(log)}>
            削除
          </button>
        )}
        <button type="button" className="secondary-btn" onClick={onClose}>
          やめる
        </button>
        <button type="button" className="primary-btn" onClick={save}>
          保存
        </button>
      </div>
    </BottomSheet>
  );
}
