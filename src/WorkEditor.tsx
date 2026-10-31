import { useState } from "react";
import { MEDIUM_LABEL, STATUS_LABEL, WEEKDAY_LABEL, doneWord, wishWord } from "./constants";
import { formatDate, formatDateShort, isDateKey, nowIso, weekdayOf } from "./dateUtils";
import { Icon } from "./Icon";
import { progressKindOf, withAutoStatus } from "./progressLogic";
import { Screen, Stars } from "./Screen";
import { personNames, resolveFranchise, resolvePeople } from "./linkLogic";
import type { DataSet, Franchise, Log, Medium, OwnedMedium, PaperPlace, Person, VolumeRange, Work, WorkStatus } from "./types";
import { MEDIA } from "./types";
import { emptyWork, newLog } from "./workFactory";

/** 「1-5, 7」→ [{1,5},{7,7}] */
export function parseRanges(text: string): VolumeRange[] | null {
  const parts = text.split(/[,、\s]+/).filter(Boolean);
  const out: VolumeRange[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d+)(?:[-〜~ー](\d+))?$/);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < from) return null;
    out.push({ from, to });
  }
  return out;
}

export function rangesText(ranges: VolumeRange[]): string {
  return ranges.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`)).join(", ");
}

function numOrNull(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t.normalize("NFKC"));
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

const OWNED_MEDIA: { value: OwnedMedium; label: string }[] = [
  { value: null, label: "なし" },
  { value: "paper", label: "紙" },
  { value: "kindle", label: "Kindle" },
  { value: "jump_plus", label: "ジャンプ＋" },
];
const PLACES: { value: PaperPlace; label: string }[] = [
  { value: "home", label: "自宅" },
  { value: "parents_home", label: "実家" },
  { value: "both", label: "両方" },
  { value: null, label: "未設定" },
];

interface Props {
  /** null＝新規 */
  work: Work | null;
  initialMedium: Medium;
  today: string;
  /** 親作品・人物の候補と名前の解決に使う */
  data: DataSet;
  onCancel: () => void;
  onSave: (work: Work, firstLog: Log | null, created: { franchises: Franchise[]; people: Person[] }) => void;
}

export function WorkEditor({ work, initialMedium, today, data, onCancel, onSave }: Props) {
  const isNew = work === null;
  // 週刊誌は登録したらすぐ毎週数えたいので、発売日の欄を最初から出す
  const withMagazineSchedule = (x: Work): Work => (x.medium === "magazine" && !x.schedule ? { ...x, schedule: { firstDate: today, firstNumber: 1, skipDates: [] } } : x);
  const [w, setW] = useState<Work>(() => work ?? withMagazineSchedule(emptyWork(initialMedium)));
  const kind = progressKindOf(w);
  const [progressText, setProgressText] = useState(w.progress?.toString() ?? "");
  const [totalText, setTotalText] = useState(w.total?.toString() ?? "");
  const [latestText, setLatestText] = useState(w.latestKnown?.toString() ?? "");
  const [firstNumberText, setFirstNumberText] = useState(w.schedule?.firstNumber.toString() ?? "1");
  const [rangeText, setRangeText] = useState(w.owned ? rangesText(w.owned.ranges) : "");
  const [skipDraft, setSkipDraft] = useState("");
  // 新規の映画・小説などは、その場で「見た記録」も付けられる
  const [viewDate, setViewDate] = useState(today);
  const [viewNote, setViewNote] = useState("");
  const [viewRating, setViewRating] = useState<number | null>(null);
  const [viewPlace, setViewPlace] = useState("");
  const [error, setError] = useState("");
  const [franchiseText, setFranchiseText] = useState(() => (work?.franchiseId ? data.franchises.find((f) => f.id === work.franchiseId)?.title ?? "" : ""));
  const [people, setPeople] = useState<string[]>(() => (work ? personNames(data, work.personIds) : []));
  const [personDraft, setPersonDraft] = useState("");
  const addPerson = () => {
    const n = personDraft.trim();
    if (n && !people.includes(n)) setPeople([...people, n]);
    setPersonDraft("");
  };

  const set = (patch: Partial<Work>) => setW((cur) => ({ ...cur, ...patch }));
  const changeMedium = (m: Medium) =>
    setW((cur) =>
      withMagazineSchedule({
        ...cur,
        medium: m,
        owned: m === "manga" ? cur.owned ?? { known: false, ranges: [], medium: null, place: null } : null,
        schedule: m === "anime" || m === "drama" || m === "magazine" ? cur.schedule : null,
        status: progressKindOf({ medium: m }) === "none" && (cur.status === "active" || cur.status === "paused") ? "done" : cur.status,
      }),
    );

  const scheduleOn = w.schedule !== null;
  const toggleSchedule = (on: boolean) => set({ schedule: on ? { firstDate: today, firstNumber: 1, skipDates: [] } : null });

  const save = () => {
    if (!w.title.trim()) return setError("タイトルを入れてください");
    const progress = numOrNull(progressText);
    const total = numOrNull(totalText);
    const latest = numOrNull(latestText);
    const firstNumber = numOrNull(firstNumberText);
    if ([progress, total, latest].some((n) => Number.isNaN(n)) || (scheduleOn && (firstNumber === null || Number.isNaN(firstNumber) || firstNumber < 1))) return setError("数字の欄は0以上の整数で入れてください");
    if (w.schedule && !isDateKey(w.schedule.firstDate)) return setError("日付を選んでください");
    let ranges: VolumeRange[] = [];
    if (w.owned && rangeText.trim()) {
      const parsed = parseRanges(rangeText);
      if (!parsed) return setError("持っている巻は「1-5, 7」のように入れてください");
      ranges = parsed;
    }
    const now = nowIso();
    const fr = resolveFranchise(data.franchises, franchiseText, now);
    const pp = resolvePeople(data.people, personDraft.trim() ? [...people, personDraft] : people, now);
    let next: Work = {
      ...w,
      franchiseId: fr.id,
      personIds: pp.ids,
      setlist: w.medium === "live" ? w.setlist.trim() : w.setlist,
      title: w.title.trim(),
      kana: w.kana.trim(),
      seasonLabel: w.seasonLabel.trim(),
      progress: kind === "episode" || kind === "volume" ? progress : null,
      total: kind === "episode" || kind === "volume" ? total : null,
      latestKnown: kind === "episode" && scheduleOn ? null : kind === "episode" || kind === "volume" ? latest : null,
      schedule: w.schedule ? { ...w.schedule, firstNumber: kind === "issue" ? 1 : (firstNumber as number) } : null,
      owned: w.owned ? { ...w.owned, ranges, known: w.owned.known || ranges.length > 0 } : null,
      updatedAt: now,
      touchedAt: isNew ? now : w.touchedAt,
    };
    if (next.status === "done" && !next.completedAt) next = { ...next, completedAt: now };
    if (next.status !== "done") next = { ...next, completedAt: null };
    next = withAutoStatus(next, now);
    let firstLog: Log | null = null;
    if (isNew && kind === "none" && next.status !== "wish") {
      if (!isDateKey(viewDate)) return setError("見た日を選んでください");
      firstLog = newLog({ workId: next.id, kind: "view", date: viewDate, note: viewNote.trim(), rating: viewRating, place: viewPlace.trim() }, now);
      next = { ...next, status: "done", completedAt: next.completedAt ?? now };
    }
    onSave(next, firstLog, { franchises: fr.created, people: pp.created });
  };

  const statusChoices: WorkStatus[] = kind === "none" ? ["done", "wish"] : ["active", "wish", "paused", "done"];
  const statusLabel = (s: WorkStatus) => (kind === "none" ? (s === "done" ? doneWord(w.medium) : wishWord(w.medium)) : s === "done" ? "見終わった" : STATUS_LABEL[s]);

  return (
    <Screen
      title={isNew ? "作品を登録" : "作品を編集"}
      onBack={onCancel}
      actions={
        <button type="button" className="primary-btn small-btn" onClick={save}>
          保存
        </button>
      }
    >
      <div className="form card">
        <div className="field">
          <span className="field-label">種類</span>
          <div className="chips">
            {MEDIA.map((m) => (
              <button key={m} type="button" className={`chip${w.medium === m ? " on" : ""}`} onClick={() => changeMedium(m)}>
                {MEDIUM_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">タイトル</span>
          <input className="text-input" value={w.title} onChange={(e) => set({ title: e.target.value })} placeholder={w.medium === "magazine" ? "例：週刊少年ジャンプ" : "作品名"} />
        </label>
        <label className="field">
          <span className="field-label">読み仮名（任意）</span>
          <input className="text-input" value={w.kana} onChange={(e) => set({ kana: e.target.value })} />
        </label>
        {kind === "episode" && (
          <label className="field">
            <span className="field-label">シーズン・編（任意）</span>
            <input className="text-input" value={w.seasonLabel} onChange={(e) => set({ seasonLabel: e.target.value })} placeholder="例：第2期" />
          </label>
        )}
        <div className="field">
          <span className="field-label">状態</span>
          <div className="segmented">
            {statusChoices.map((s) => (
              <button key={s} type="button" className={`seg${w.status === s ? " on" : ""}`} onClick={() => set({ status: s })}>
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(kind === "episode" || kind === "volume") && (
        <div className="form card">
          <div className="two-col">
            <label className="field">
              <span className="field-label">{kind === "episode" ? "何話まで見た" : "何巻まで読んだ"}</span>
              <input className="text-input" inputMode="numeric" value={progressText} onChange={(e) => setProgressText(e.target.value)} placeholder="0" />
            </label>
            <label className="field">
              <span className="field-label">{kind === "episode" ? "全何話（任意）" : "全何巻（任意）"}</span>
              <input className="text-input" inputMode="numeric" value={totalText} onChange={(e) => setTotalText(e.target.value)} />
            </label>
          </div>
          <div className="field">
            <span className="field-label">{kind === "episode" ? "放送" : "連載"}</span>
            <div className="segmented">
              {[
                { v: false, l: kind === "episode" ? "放送中" : "連載中" },
                { v: true, l: "完結" },
                { v: null, l: "分からない" },
              ].map((o) => (
                <button key={String(o.v)} type="button" className={`seg${w.finished === o.v ? " on" : ""}`} onClick={() => set({ finished: o.v })}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          {kind === "episode" && (
            <label className="toggle-row">
              <span>放送日で未消化を数える</span>
              <input type="checkbox" checked={scheduleOn} onChange={(e) => toggleSchedule(e.target.checked)} />
            </label>
          )}
          {(kind === "volume" || (kind === "episode" && !scheduleOn)) && (
            <label className="field">
              <span className="field-label">{kind === "episode" ? "放送・公開済みの話数（任意）" : "既刊（任意。完結なら全巻数でよい）"}</span>
              <input className="text-input" inputMode="numeric" value={latestText} onChange={(e) => setLatestText(e.target.value)} />
            </label>
          )}
        </div>
      )}

      {(kind === "issue" || (kind === "episode" && scheduleOn)) && w.schedule && (
        <div className="form card">
          <div className="two-col">
            <label className="field">
              <span className="field-label">{kind === "issue" ? "数え始める号の発売日" : "数え始める回の放送日"}</span>
              <input className="text-input" type="date" value={w.schedule.firstDate} onChange={(e) => set({ schedule: { ...w.schedule!, firstDate: e.target.value } })} />
            </label>
            {kind === "episode" && (
              <label className="field">
                <span className="field-label">その回は第何話</span>
                <input className="text-input" inputMode="numeric" value={firstNumberText} onChange={(e) => setFirstNumberText(e.target.value)} />
              </label>
            )}
          </div>
          {isDateKey(w.schedule.firstDate) && <p className="field-hint">毎週{WEEKDAY_LABEL[weekdayOf(w.schedule.firstDate)]}曜日に1{kind === "issue" ? "冊" : "話"}ずつ増えます。</p>}
          {kind === "issue" && (
            <label className="field">
              <span className="field-label">最後に読んだ号の発売日（任意）</span>
              <input className="text-input" type="date" value={w.readThrough ?? ""} onChange={(e) => set({ readThrough: e.target.value || null })} />
            </label>
          )}
          <div className="field">
            <span className="field-label">{kind === "issue" ? "休みの週（合併号の翌週など）" : "休止した週"}</span>
            {w.schedule.skipDates.length > 0 && (
              <div className="chips">
                {[...w.schedule.skipDates].sort().map((d) => (
                  <button key={d} type="button" className="chip on" aria-label={`${formatDate(d, today)}の休みを外す`} onClick={() => set({ schedule: { ...w.schedule!, skipDates: w.schedule!.skipDates.filter((x) => x !== d) } })}>
                    {formatDateShort(d)} <Icon name="close" size={14} />
                  </button>
                ))}
              </div>
            )}
            <div className="inline-add">
              <input className="text-input" type="date" value={skipDraft} onChange={(e) => setSkipDraft(e.target.value)} aria-label="休みの日" />
              <button
                type="button"
                className="secondary-btn"
                disabled={!isDateKey(skipDraft)}
                onClick={() => {
                  if (!w.schedule!.skipDates.includes(skipDraft)) set({ schedule: { ...w.schedule!, skipDates: [...w.schedule!.skipDates, skipDraft] } });
                  setSkipDraft("");
                }}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}
      {kind === "issue" && !w.schedule && (
        <div className="card">
          <button type="button" className="secondary-btn" onClick={() => toggleSchedule(true)}>
            発売曜日を決める
          </button>
        </div>
      )}

      {w.owned && (
        <div className="form card">
          <label className="field">
            <span className="field-label">持っている巻（任意）</span>
            <input className="text-input" value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="例：1-5, 7" />
          </label>
          <div className="field">
            <span className="field-label">形</span>
            <div className="chips">
              {OWNED_MEDIA.map((o) => (
                <button key={String(o.value)} type="button" className={`chip${w.owned!.medium === o.value ? " on" : ""}`} onClick={() => set({ owned: { ...w.owned!, medium: o.value } })}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {w.owned.medium === "paper" && (
            <div className="field">
              <span className="field-label">置き場所</span>
              <div className="chips">
                {PLACES.map((o) => (
                  <button key={String(o.value)} type="button" className={`chip${w.owned!.place === o.value ? " on" : ""}`} onClick={() => set({ owned: { ...w.owned!, place: o.value } })}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="field">
            <span className="field-label">版（任意）</span>
            <input className="text-input" value={w.edition} onChange={(e) => set({ edition: e.target.value })} placeholder="例：新装版" />
          </label>
        </div>
      )}

      {isNew && kind === "none" && w.status !== "wish" && (
        <div className="form card">
          <label className="field">
            <span className="field-label">{doneWord(w.medium)}日</span>
            <input className="text-input" type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">どこで・どうやって（任意）</span>
            <input className="text-input" value={viewPlace} onChange={(e) => setViewPlace(e.target.value)} placeholder="例：映画館、配信、家" />
          </label>
          <div className="field">
            <span className="field-label">星（任意）</span>
            <Stars value={viewRating} onChange={setViewRating} />
          </div>
          <label className="field">
            <span className="field-label">感想（任意）</span>
            <textarea className="text-input note-input" rows={5} value={viewNote} onChange={(e) => setViewNote(e.target.value)} />
          </label>
        </div>
      )}

      <div className="form card">
        <label className="field">
          <span className="field-label">親作品・シリーズ（任意）</span>
          <input className="text-input" list="franchise-list" value={franchiseText} onChange={(e) => setFranchiseText(e.target.value)} placeholder="同じ原作のアニメ・マンガ・映画をまとめる名前" />
          <datalist id="franchise-list">
            {data.franchises.filter((f) => f.deletedAt === null).map((f) => <option key={f.id} value={f.title} />)}
          </datalist>
        </label>
        <div className="field">
          <span className="field-label">{w.medium === "live" ? "出演者・アーティスト（任意）" : "人物（任意。俳優・声優・作者など）"}</span>
          {people.length > 0 && (
            <div className="chips">
              {people.map((n) => (
                <button key={n} type="button" className="chip on" aria-label={`${n}を外す`} onClick={() => setPeople(people.filter((x) => x !== n))}>
                  {n} <Icon name="close" size={14} />
                </button>
              ))}
            </div>
          )}
          <div className="inline-add">
            <input
              className="text-input"
              list="person-list"
              value={personDraft}
              onChange={(e) => setPersonDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }}
              placeholder="名前"
              aria-label="人物の名前"
            />
            <button type="button" className="secondary-btn" disabled={!personDraft.trim()} onClick={addPerson}>追加</button>
          </div>
          <datalist id="person-list">
            {data.people.filter((p) => p.deletedAt === null).map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
        </div>
        {w.medium === "live" && (
          <label className="field">
            <span className="field-label">セットリスト（任意）</span>
            <textarea className="text-input note-input" rows={5} value={w.setlist} onChange={(e) => set({ setlist: e.target.value })} placeholder="1曲ずつ改行" />
          </label>
        )}
      </div>

      <div className="form card">
        <label className="field">
          <span className="field-label">メモ（任意）</span>
          <textarea className="text-input note-input" rows={3} value={w.memo} onChange={(e) => set({ memo: e.target.value })} />
        </label>
      </div>
      {error && <p className="field-error center">{error}</p>}
      <button type="button" className="primary-btn wide" onClick={save}>
        保存
      </button>
    </Screen>
  );
}
