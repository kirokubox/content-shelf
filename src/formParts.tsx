// 入力画面と記録のシートで使う部品（セグメント・日付の細かさ・どこで）
import type { DatePrecision, Medium } from "./types";

/** 横並びの選択（セグメント）。項目名は左に置いて縦を短くする。allowClear なら選択中をもう一度押すと外す */
export function SegRow<T>({ label, value, choices, onChange, clearValue }: { label: string; value: T; choices: readonly { value: T; label: string }[]; onChange: (v: T) => void; clearValue?: T }) {
  return (
    <div className="seg-row">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {choices.map((c) => (
          <button
            key={String(c.value)}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            className={`seg${value === c.value ? " on" : ""}`}
            onClick={() => onChange(value === c.value && clearValue !== undefined ? clearValue : c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 日付の細かさ。"none"＝分からない（記録を付けない。登録画面だけ） */
export type PrecisionChoice = DatePrecision | "none";

const PRECISIONS: { value: PrecisionChoice; label: string }[] = [
  { value: "day", label: "日付" },
  { value: "month", label: "年月" },
  { value: "year", label: "年だけ" },
  { value: "none", label: "不明" },
];

/** 日付（細かさを右上で選ぶ）。昔の作品は年だけ・年月だけで付けられる */
export function DateField({ label, value, precision, today, allowUnknown, onChange }: { label: string; value: string; precision: PrecisionChoice; today: string; allowUnknown?: boolean; onChange: (value: string, precision: PrecisionChoice) => void }) {
  const changePrecision = (p: PrecisionChoice) => {
    // 入っている日付から、新しい細かさの形へ（2015-03-10 → 2015-03 → 2015）
    const year = value.slice(0, 4) || today.slice(0, 4);
    const month = value.length >= 7 ? value.slice(0, 7) : `${year}-${today.slice(5, 7)}`;
    const next = p === "year" ? year : p === "month" ? month : p === "day" ? (value.length === 10 ? value : `${month}-01`) : value;
    onChange(next, p);
  };
  return (
    <div className="field">
      <span className="field-label date-label">
        {label}
        <select className="precision-select" value={precision} onChange={(e) => changePrecision(e.target.value as PrecisionChoice)} aria-label="日付の細かさ">
          {PRECISIONS.filter((p) => allowUnknown || p.value !== "none").map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </span>
      {precision === "day" && <input className="text-input" type="date" value={value} max={today} onChange={(e) => onChange(e.target.value, precision)} aria-label={label} />}
      {precision === "month" && <input className="text-input" type="month" value={value} max={today.slice(0, 7)} onChange={(e) => onChange(e.target.value, precision)} aria-label={label} />}
      {precision === "year" && <input className="text-input" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value, precision)} placeholder="例：2015" aria-label={label} />}
      {precision === "none" && <span className="text-input placeholder-box">記録を付けない</span>}
    </div>
  );
}

const MOVIE_PLACES = [
  { value: "映画館", label: "映画館" },
  { value: "配信", label: "配信" },
  { value: "テレビ", label: "テレビ" },
];

/** どこで：映画はボタン、LIVEは会場、ほかは文字で。小説・ゲームは出さない */
export function hasPlace(medium: Medium): boolean {
  return medium !== "novel" && medium !== "game" && medium !== "manga" && medium !== "magazine";
}

export function PlaceField({ medium, value, onChange }: { medium: Medium; value: string; onChange: (v: string) => void }) {
  if (!hasPlace(medium)) return null;
  if (medium === "movie" && (value === "" || MOVIE_PLACES.some((p) => p.value === value))) {
    return <SegRow label="どこで" value={value} choices={MOVIE_PLACES} onChange={onChange} clearValue="" />;
  }
  return (
    <label className="field">
      <span className="field-label">{medium === "live" ? "会場" : "どこで"}</span>
      <input className="text-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={medium === "live" ? "例：日本武道館" : "配信・家など"} />
    </label>
  );
}
