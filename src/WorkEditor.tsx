import { useEffect, useState } from "react";
import { MEDIUM_LABEL, WEEKDAY_LABEL, doneWord, peopleLabel, statusWord } from "./constants";
import { formatDate, formatDateShort, isDateKey, nowIso, weekdayOf } from "./dateUtils";
import { Icon } from "./Icon";
import { progressKindOf, withAutoStatus } from "./progressLogic";
import { Screen, Stars } from "./Screen";
import { airedFromAnilist, seasonLabelOf } from "./anilist";
import type { AnilistMedia } from "./anilist";
import { AnilistResults } from "./AnilistPicker";
import { personNames, resolveFranchise, resolvePeople } from "./linkLogic";
import type { DataSet, Franchise, Log, Medium, OwnedMedium, PaperPlace, Person, VideoOwned, VolumeRange, Work, WorkStatus } from "./types";
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
  { value: null, label: "未設定" },
  { value: "home", label: "自宅" },
  { value: "parents_home", label: "実家" },
  { value: "both", label: "両方" },
];
const VIDEO_CHOICES: { value: VideoOwned; label: string }[] = [
  { value: null, label: "なし" },
  { value: "dvd", label: "DVD" },
  { value: "bluray", label: "Blu-ray" },
  { value: "digital", label: "配信" },
];

/** 横並びの選択（セグメント）。項目名は左に置いて縦を短くする */
function SegRow<T>({ label, value, choices, onChange }: { label: string; value: T; choices: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg-row">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {choices.map((c) => (
          <button key={String(c.value)} type="button" role="radio" aria-checked={value === c.value} className={`seg${value === c.value ? " on" : ""}`} onClick={() => onChange(c.value)}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  /** null＝新規 */
  work: Work | null;
  initialMedium: Medium;
  today: string;
  /** 親作品・人物の候補と名前の解決に使う */
  data: DataSet;
  /** 検索画面でAniListの作品を選んで来たとき */
  pick?: AnilistMedia | null;
  onCancel: () => void;
  onSave: (work: Work, firstLog: Log | null, created: { franchises: Franchise[]; people: Person[] }) => void;
}

export function WorkEditor({ work, initialMedium, today, data, pick, onCancel, onSave }: Props) {
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
  const [searching, setSearching] = useState(false);
  const [mediumOpen, setMediumOpen] = useState(false);
  const applyPick = (m: AnilistMedia) => {
    setW((cur) => ({
      ...cur,
      title: cur.title.trim() ? cur.title : m.title,
      seasonLabel: cur.seasonLabel.trim() || m.type !== "ANIME" ? cur.seasonLabel : seasonLabelOf(m),
      finished: m.status === "FINISHED" ? true : m.status === "RELEASING" || m.status === "HIATUS" || m.status === "NOT_YET_RELEASED" ? false : cur.finished,
      coverUrl: m.cover ?? cur.coverUrl,
      externalIds: { ...cur.externalIds, anilist: m.id },
      infoCheckedAt: nowIso(),
    }));
    const total = m.type === "ANIME" ? m.episodes : m.volumes;
    if (total) setTotalText(String(total));
    const aired = airedFromAnilist(m);
    if (aired !== null) setLatestText(String(aired));
    setSearching(false);
  };
  // 検索画面から来たときは、選んだ作品で最初から埋める
  useEffect(() => {
    if (pick) applyPick(pick);
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      setlist: w.medium === "live" || w.medium === "video" ? w.setlist.trim() : w.setlist,
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
  const removePerson = (n: string) => setPeople(people.filter((x) => x !== n));

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
      {/* 作品：種類・タイトル・状態 */}
      <div className="form card compact">
        <div className="inline-row">
          <span className="field-label">種類</span>
          <span className="inline-value">{MEDIUM_LABEL[w.medium]}</span>
          <button type="button" className="text-btn" onClick={() => setMediumOpen(!mediumOpen)}>{mediumOpen ? "閉じる" : "変える"}</button>
        </div>
        {mediumOpen && (
          <div className="chips">
            {MEDIA.map((m) => (
              <button key={m} type="button" className={`chip${w.medium === m ? " on" : ""}`} onClick={() => { changeMedium(m); setMediumOpen(false); }}>
                {MEDIUM_LABEL[m]}
              </button>
            ))}
          </div>
        )}
        <div className="title-row">
          {w.coverUrl && <img className="cover-thumb" src={w.coverUrl} alt="" />}
          <div className="grow form-stack">
            <label className="field">
              <span className="field-label">タイトル</span>
              <input className="text-input" value={w.title} onChange={(e) => set({ title: e.target.value })} placeholder={w.medium === "magazine" ? "例：週刊少年ジャンプ" : "作品名"} />
            </label>
            {kind === "episode" && (
              <input className="text-input" value={w.seasonLabel} onChange={(e) => set({ seasonLabel: e.target.value })} placeholder="シーズン・編（例：第2期）" aria-label="シーズン・編" />
            )}
          </div>
        </div>
        {(w.medium === "anime" || w.medium === "manga") && (
          <div className="field">
            {w.externalIds.anilist ? (
              <div className="picked">
                <span className="muted small">AniListとつながっています（表紙・話数・完結を自動で確かめます）</span>
                <button type="button" className="text-btn" onClick={() => setW({ ...w, externalIds: { ...w.externalIds, anilist: undefined }, coverUrl: null, infoCheckedAt: null })}>外す</button>
              </div>
            ) : (
              <button type="button" className="secondary-btn" disabled={!w.title.trim()} onClick={() => setSearching(!searching)}>
                <Icon name="search" size={18} /> {searching ? "探すのをやめる" : "AniListで表紙・話数を探す"}
              </button>
            )}
            {searching && <AnilistResults term={w.title} type={w.medium === "anime" ? "ANIME" : "MANGA"} onPick={applyPick} />}
          </div>
        )}
        <SegRow label="状態" value={w.status} choices={statusChoices.map((s) => ({ value: s, label: statusWord(w.medium, s) }))} onChange={(s) => set({ status: s })} />
      </div>

      {/* 続き：数字は横に並べる */}
      {(kind === "episode" || kind === "volume") && (
        <div className="form card compact">
          <div className={kind === "episode" && scheduleOn ? "two-col" : "three-col"}>
            <label className="field">
              <span className="field-label">{kind === "episode" ? "見た話" : "読んだ巻"}</span>
              <input className="text-input" inputMode="numeric" value={progressText} onChange={(e) => setProgressText(e.target.value)} placeholder="0" />
            </label>
            {(kind === "volume" || !scheduleOn) && (
              <label className="field">
                <span className="field-label">{kind === "episode" ? "放送済み" : "既刊"}</span>
                <input className="text-input" inputMode="numeric" value={latestText} onChange={(e) => setLatestText(e.target.value)} placeholder="−" />
              </label>
            )}
            <label className="field">
              <span className="field-label">{kind === "episode" ? "全話数" : "全巻数"}</span>
              <input className="text-input" inputMode="numeric" value={totalText} onChange={(e) => setTotalText(e.target.value)} placeholder="−" />
            </label>
          </div>
          <SegRow
            label={kind === "episode" ? "放送" : "連載"}
            value={w.finished}
            choices={[
              { value: false, label: kind === "episode" ? "放送中" : "連載中" },
              { value: true, label: "完結" },
              { value: null, label: "不明" },
            ]}
            onChange={(v) => set({ finished: v })}
          />
          {kind === "episode" && (
            <label className="toggle-row">
              <span>放送日から未消化を数える</span>
              <input type="checkbox" checked={scheduleOn} onChange={(e) => toggleSchedule(e.target.checked)} />
            </label>
          )}
        </div>
      )}

      {/* 毎週の放送・発売 */}
      {(kind === "issue" || (kind === "episode" && scheduleOn)) && w.schedule && (
        <div className="form card compact">
          <div className="two-col">
            <label className="field">
              <span className="field-label">{kind === "issue" ? "数え始める号の発売日" : "数え始める回の放送日"}</span>
              <input className="text-input" type="date" value={w.schedule.firstDate} onChange={(e) => set({ schedule: { ...w.schedule!, firstDate: e.target.value } })} />
            </label>
            {kind === "episode" ? (
              <label className="field">
                <span className="field-label">その回は第何話</span>
                <input className="text-input" inputMode="numeric" value={firstNumberText} onChange={(e) => setFirstNumberText(e.target.value)} />
              </label>
            ) : (
              <label className="field">
                <span className="field-label">最後に読んだ号の発売日</span>
                <input className="text-input" type="date" value={w.readThrough ?? ""} onChange={(e) => set({ readThrough: e.target.value || null })} />
              </label>
            )}
          </div>
          {isDateKey(w.schedule.firstDate) && <p className="field-hint">毎週{WEEKDAY_LABEL[weekdayOf(w.schedule.firstDate)]}曜日に1{kind === "issue" ? "冊" : "話"}ずつ増えます。</p>}
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
                className="secondary-btn add-btn"
                aria-label="休みの週を追加"
                disabled={!isDateKey(skipDraft)}
                onClick={() => {
                  if (!w.schedule!.skipDates.includes(skipDraft)) set({ schedule: { ...w.schedule!, skipDates: [...w.schedule!.skipDates, skipDraft] } });
                  setSkipDraft("");
                }}
              >
                <Icon name="plus" size={18} />
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

      {/* マンガの所持 */}
      {w.owned && (
        <div className="form card compact">
          <label className="toggle-row">
            <span className="toggle-text">
              新刊を買う
              <span className="field-hint">新刊と、まだ買っていない巻を知らせます</span>
            </span>
            <input type="checkbox" checked={w.buying} onChange={(e) => set({ buying: e.target.checked })} />
          </label>
          <div className="two-col">
            <label className="field">
              <span className="field-label">持っている巻</span>
              <input className="text-input" value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="例：1-5, 7" />
            </label>
            <label className="field">
              <span className="field-label">版</span>
              <input className="text-input" value={w.edition} onChange={(e) => set({ edition: e.target.value })} placeholder="例：新装版" />
            </label>
          </div>
          <SegRow label="形" value={w.owned.medium} choices={OWNED_MEDIA} onChange={(v) => set({ owned: { ...w.owned!, medium: v } })} />
          {w.owned.medium === "paper" && <SegRow label="置き場所" value={w.owned.place} choices={PLACES} onChange={(v) => set({ owned: { ...w.owned!, place: v } })} />}
        </div>
      )}

      {/* 新規の単発もの：その場で見た記録 */}
      {isNew && kind === "none" && w.status !== "wish" && (
        <div className="form card compact">
          <div className="two-col">
            <label className="field">
              <span className="field-label">{doneWord(w.medium)}日</span>
              <input className="text-input" type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{w.medium === "live" ? "会場" : "どこで"}</span>
              <input className="text-input" value={viewPlace} onChange={(e) => setViewPlace(e.target.value)} placeholder={w.medium === "live" ? "例：日本武道館" : "映画館・配信など"} />
            </label>
          </div>
          <div className="inline-row">
            <span className="field-label">星</span>
            <Stars value={viewRating} onChange={setViewRating} />
          </div>
          <textarea className="text-input note-input" rows={3} value={viewNote} onChange={(e) => setViewNote(e.target.value)} placeholder="感想（任意）" aria-label="感想" />
        </div>
      )}

      {/* つながり：親作品・人物（LIVEは映像・セットリストも） */}
      <div className="form card compact">
        <div className="two-col">
          <label className="field">
            <span className="field-label">親作品・シリーズ</span>
            <input className="text-input" list="franchise-list" value={franchiseText} onChange={(e) => setFranchiseText(e.target.value)} placeholder="シリーズ名" />
            <datalist id="franchise-list">
              {data.franchises.filter((f) => f.deletedAt === null).map((f) => <option key={f.id} value={f.title} />)}
            </datalist>
          </label>
          <div className="field">
            <span className="field-label">{peopleLabel(w.medium)}</span>
            <div className="inline-add">
              <input
                className="text-input"
                list="person-list"
                value={personDraft}
                onChange={(e) => setPersonDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }}
                placeholder="名前"
                aria-label={`${peopleLabel(w.medium)}の名前`}
              />
              <button type="button" className="secondary-btn add-btn" aria-label="追加" disabled={!personDraft.trim()} onClick={addPerson}>
                <Icon name="plus" size={18} />
              </button>
            </div>
            <datalist id="person-list">
              {data.people.filter((p) => p.deletedAt === null).map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
          </div>
        </div>
        {people.length > 0 && (
          <div className="chips">
            {people.map((n) => (
              <button key={n} type="button" className="chip on" aria-label={`${n}を外す`} onClick={() => removePerson(n)}>
                {n} <Icon name="close" size={14} />
              </button>
            ))}
          </div>
        )}
        {(w.medium === "live" || w.medium === "video") && (
          <>
            <SegRow label="映像" value={w.videoOwned} choices={VIDEO_CHOICES} onChange={(v) => set({ videoOwned: v })} />
            <textarea className="text-input note-input" rows={3} value={w.setlist} onChange={(e) => set({ setlist: e.target.value })} placeholder="セットリスト（1曲ずつ改行）" aria-label="セットリスト" />
          </>
        )}
      </div>

      {/* そのほか */}
      <div className="form card compact">
        <div className="two-col">
          <label className="field">
            <span className="field-label">読み仮名</span>
            <input className="text-input" value={w.kana} onChange={(e) => set({ kana: e.target.value })} placeholder="並べ替えに使う" />
          </label>
          <label className="field">
            <span className="field-label">画像のURL</span>
            <input className="text-input" inputMode="url" value={w.coverUrl ?? ""} onChange={(e) => set({ coverUrl: e.target.value.trim() || null })} placeholder="https://…" />
          </label>
        </div>
        <textarea className="text-input note-input" rows={2} value={w.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="メモ（任意）" aria-label="メモ" />
        {w.legacyNote && <p className="field-hint">移行したときのメモ：{w.legacyNote}</p>}
      </div>
      {error && <p className="field-error center">{error}</p>}
      <button type="button" className="primary-btn wide" onClick={save}>
        保存
      </button>
    </Screen>
  );
}
