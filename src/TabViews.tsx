import { useMemo, useState } from "react";
import { currentCourList, currentCourName, latestViaMap, subLabel, viaPlaceText } from "./courLogic";
import { CoverImg } from "./CoverImg";
import { MEDIUM_LABEL, doneWord, mediumTag, workStatusWord } from "./constants";
import { formatDate, formatDateShort, formatLogDate, isoToDateKey } from "./dateUtils";
import { Icon } from "./Icon";
import { Screen, Stars } from "./Screen";
import { countUnit, completedWorks, monthlyCounts, summarize } from "./summaryLogic";
import type { Period } from "./summaryLogic";
import type { DataSet, Log, Medium, Work } from "./types";
import { MEDIA } from "./types";
import { WorkCard } from "./WorkCard";
import { visibleFilterMedia, visibleMedia } from "./mediaPrefs";
import { MonthSummaryView } from "./MonthSummaryView";
import { continueGroup, hasNext, isTsundoku, ownedGapSummary, unconsumedCount } from "./progressLogic";
import { upcomingByMedium } from "./expectLogic";
import type { UpcomingItem } from "./expectLogic";
import { countdownText, formatFuzzy, workExpect } from "./expectLogic";
import { SortControl, useSortPref } from "./SortControl";
import { ScrollHideBar } from "./ScrollHideBar";
import { ChoiceSheet } from "./BottomSheet";
import { defaultSortPref, lastLoggedMap, sortItems, sortWorks } from "./sortLogic";

interface CardHandlers {
  today: string;
  onFinish: (work: Work) => void;
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

function RecordRow({ item, onOpen }: { item: RecordItem; onOpen: (item: RecordItem) => void }) {
  const { work, log } = item;
  return (
    <li>
      <button type="button" className="list-row" onClick={() => onOpen(item)}>
        <CoverImg work={work} className="cover-thumb record-cover" />
        <span className="list-main">
          <span className="list-name">
            {work.title}
            {subLabel(work) && <span className="work-season"> {subLabel(work)}</span>}
          </span>
          <span className="list-sub">
            <span className="medium-tag">{mediumTag(work)}</span>
            {log ? [viaPlaceText(log), log.position ? `${log.position}巻` : ""].filter(Boolean).join("　") || doneWord(work.medium) : workStatusWord(work, "done")}
          </span>
          {log?.note && <span className="list-sub wrap note-excerpt">{log.note}</span>}
        </span>
        <span className="record-side">
          <span className="list-sub">{formatLogDate(item.date, item.log?.datePrecision, undefined, true)}</span>
          {log?.rating ? <Stars value={log.rating} /> : null}
        </span>
      </button>
    </li>
  );
}

/** 楽しみの予定の1行（例：マンガ　12巻　発売 12月20日（土）） */
function UpcomingRow({ item, today, onOpen }: { item: UpcomingItem; today: string; onOpen: (work: Work) => void }) {
  const { work } = item;
  return (
    <li>
      <button type="button" className="list-row" onClick={() => onOpen(work)}>
        <CoverImg work={work} className="cover-thumb record-cover" />
        <span className="list-main">
          <span className="list-name">
            {work.title}
            {item.volume !== null && <span className="work-season"> {item.volume}巻</span>}
          </span>
          <span className="list-sub">
            <span className="medium-tag">{mediumTag(work)}</span>
            {item.label} {formatFuzzy(item.date, today)}
          </span>
        </span>
        <span className="badge countdown">{countdownText(item.date, today)}</span>
      </button>
    </li>
  );
}

export function HomeView({ data, handlers, onAdd, onGoContinue, onGoCour, onGoRecords, onOpenRecord, enabledMedia, onToggleMedium }: { onGoCour: () => void; enabledMedia: Medium[] | null; onToggleMedium: (medium: Medium) => void; data: DataSet; handlers: CardHandlers; onAdd: () => void; onGoContinue: () => void; onGoRecords: () => void; onOpenRecord: (item: RecordItem) => void }) {
  const covers = useMemo(
    () => data.works.filter((w) => w.deletedAt === null).sort((a, b) => b.touchedAt.localeCompare(a.touchedAt)).slice(0, 12),
    [data.works],
  );
  const viaMap = useMemo(() => latestViaMap(data.logs), [data.logs]);
  // 今期のアニメ：最初から開いておく。未視聴が無い（追いついた）作品だけたたむ
  // 今期のアニメ：放送枠の順（月曜から。v0.20.0）
  const cour = useMemo(() => sortItems(currentCourList(data.works, data.logs, handlers.today).active, defaultSortPref("cour"), { work: (c) => c.work }), [data.works, data.logs, handlers.today]);
  const courMain = cour.filter((c) => unconsumedCount(c.work, handlers.today) !== 0);
  const courIds = useMemo(() => new Set(cour.map((c) => c.work.id)), [cour]);
  const upcoming = useMemo(() => upcomingByMedium(data.works, handlers.today), [data.works, handlers.today]);
  // ホームに出す積読（詳細画面で1冊選ぶ）。もう積読でなくなっていたら出さない
  const pick = data.works.find((w) => w.deletedAt === null && w.homePick && isTsundoku(w)) ?? null;
  const waiting = useMemo(
    () => data.works
      .filter((w) => w.deletedAt === null && !courIds.has(w.id) && continueGroup(w, { today: handlers.today, latestVia: viaMap.get(w.id) ?? null }) === "current" && hasNext(w, handlers.today))
      .sort((a, b) => (unconsumedCount(b, handlers.today) ?? 0) - (unconsumedCount(a, handlers.today) ?? 0) || b.touchedAt.localeCompare(a.touchedAt))
      .slice(0, 5),
    [data.works, handlers.today, viaMap, courIds],
  );
  const records = useMemo(() => buildRecordItems(data).slice(0, 5), [data]);
  if (data.works.filter((w) => w.deletedAt === null).length === 0) {
    return (
      <section className="card welcome-card" aria-label="はじめに">
        <h2>はじめに</h2>
        <p className="muted">作品の「どこまで見たか」と「いつ見たか・感想」をためていく棚です。</p>
        <ol className="welcome-steps">
          <li>
            <p className="welcome-step"><span className="welcome-no" aria-hidden="true">①</span>使う種類を選ぶ</p>
            <div className="chips welcome-media">
              {MEDIA.map((m) => {
                const on = visibleMedia(enabledMedia).includes(m);
                return (
                  <button key={m} type="button" className={`chip mini${on ? " on" : ""}`} aria-pressed={on} onClick={() => onToggleMedium(m)}>
                    {MEDIUM_LABEL[m]}
                  </button>
                );
              })}
            </div>
            <p className="muted small">外した種類は、登録するときと種類で絞り込むときの候補に出なくなります。あとから設定の「使う種類」で変えられます。</p>
          </li>
          <li>
            <p className="welcome-step"><span className="welcome-no" aria-hidden="true">②</span>右下の＋から、作品を登録する</p>
          </li>
          <li>
            <p className="welcome-step"><span className="welcome-no" aria-hidden="true">③</span>「続き」で次の話や巻を記録し、「記録」で感想を読み返す</p>
          </li>
        </ol>
        <p className="muted small">データはこの端末の中だけに保存されます。設定からバックアップを保存できます。</p>
        <Empty text="" onAdd={onAdd} />
      </section>
    );
  }
  return (
    <>
      <section className="home-shelf" aria-label="最近触った作品">
        <div className="cover-strip">
          {covers.map((work) => (
            <button key={work.id} type="button" className="shelf-cover" onClick={() => handlers.onOpen(work)} aria-label={work.title}>
              <CoverImg work={work} className="shelf-cover-image" />
              {ownedGapSummary(work).count > 0 && <span className="cover-gap-badge">抜け {ownedGapSummary(work).count}巻</span>}
            </button>
          ))}
        </div>
      </section>
      {/* 今見るもの（v0.21.0）：今期のアニメで見るものがある作品（放送枠の順）→ ほかの続きで溜まっているもの。
          追いついた今期のアニメは今期の一覧と続きタブで見る */}
      <section className="card list-card">
        <button type="button" className="list-head link-head" onClick={onGoContinue}>
          <h2>今見るもの</h2>
          <Icon name="chevron-right" size={18} />
        </button>
        {courMain.length === 0 && waiting.length === 0 ? (
          <p className="muted pad">いま見る・読む続きはありません。</p>
        ) : (
          <ul className="work-list">
            {courMain.map((c) => <WorkCard key={c.work.id} work={c.work} rerun={c.rerun} {...handlers} />)}
            {waiting.map((w) => <WorkCard key={w.id} work={w} {...handlers} />)}
          </ul>
        )}
        {cour.length > 0 && (
          <button type="button" className="list-foot-link" onClick={onGoCour}>
            今期のアニメ（{currentCourName(handlers.today)}）{cour.length}作品をすべて見る
            <Icon name="chevron-right" size={16} />
          </button>
        )}
      </section>
      {(upcoming.length > 0 || pick) && (
        <section className="card list-card">
          <div className="list-head">
            <h2>楽しみの予定</h2>
          </div>
          <ul className="list">
            {upcoming.map((u) => <UpcomingRow key={`${u.work.id}-${u.volume ?? ""}`} item={u} today={handlers.today} onOpen={handlers.onOpen} />)}
            {pick && (
              <li>
                <button type="button" className="list-row" onClick={() => handlers.onOpen(pick)}>
                  <CoverImg work={pick} className="cover-thumb record-cover" />
                  <span className="list-main">
                    <span className="list-name">{pick.title}</span>
                    <span className="list-sub"><span className="medium-tag">{mediumTag(pick)}</span>積読から</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </section>
      )}
      <section className="card list-card">
        <button type="button" className="list-head link-head" onClick={onGoRecords}>
          <h2>直近の記録</h2>
          <Icon name="chevron-right" size={18} />
        </button>
        {records.length === 0 ? (
          <p className="muted pad">見た・読んだ記録はまだありません。</p>
        ) : (
          <ul className="list">
            {records.map((r) => (
              <RecordRow key={r.key} item={r} onOpen={onOpenRecord} />
            ))}
          </ul>
        )}
      </section>
      <div className="fab-space" />
    </>
  );
}

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

type ContinueTab = "current" | "partway" | "planned";
/** 続きタブの区分（v0.17.0：追っている→現在、これから→予定。中断は途中の一番下にたたむ） */
const CONTINUE_TABS: { id: ContinueTab; label: string }[] = [
  { id: "current", label: "現在" },
  { id: "partway", label: "途中" },
  { id: "planned", label: "予定" },
];
const EMPTY_TEXT: Record<ContinueTab, string> = {
  current: "いま追っている作品はありません。今期のクール（本放送・再放送）が付いたアニメ・ドラマ、週刊誌、連載中で「続きの巻も買う」マンガ、プレイ中のゲームがここに並びます。",
  partway: "途中の作品はありません。完結した作品の続き、読みかけのマンガ、読書中の小説、再放送が終わった作品などがここに並びます。",
  planned: "予定の作品はありません。",
};

export function ContinueView({ data, handlers, onAdd, enabledMedia }: { data: DataSet; handlers: CardHandlers; onAdd: () => void; enabledMedia: Medium[] | null }) {
  const [tab, setTab] = useState<ContinueTab>("current");
  const [medium, setMedium] = useState<Medium | null>(null);
  const [cafeOnly, setCafeOnly] = useState(false);
  const [caughtUpOpen, setCaughtUpOpen] = useState(false);
  const [stoppedOpen, setStoppedOpen] = useState(false);
  const live = data.works.filter((w) => w.deletedAt === null);
  const viaMap = useMemo(() => latestViaMap(data.logs), [data.logs]);
  const inTab = live.filter((w) => continueGroup(w, { today: handlers.today, latestVia: viaMap.get(w.id) ?? null }) === tab);
  const availableMedia = MEDIA.filter((m) => inTab.some((w) => w.medium === m));
  const media = visibleFilterMedia(availableMedia, enabledMedia);
  const selectedMedium = medium !== null && media.includes(medium) ? medium : null;
  // 読む手段が漫喫のものだけに絞る（漫喫で読むものが1つでもあるときだけ出す）
  const hasCafe = inTab.some((w) => w.access === "manga_cafe");
  const shown = inTab.filter((w) => (selectedMedium === null || w.medium === selectedMedium) && (!cafeOnly || !hasCafe || w.access === "manga_cafe"));
  // 並び順（v0.19.0）：タブごとに記憶。枠（追いついている・やめたもの・積読を先に）は崩さず、枠の中だけ並べ替える
  const sortScope = tab === "current" ? "continue-current" : tab === "partway" ? "continue-partway" : "continue-planned";
  const [sortPref, setSortPref] = useSortPref(sortScope);
  const lastLogged = useMemo(() => lastLoggedMap(data.logs), [data.logs]);
  const sorted = sortWorks(shown, sortPref, { lastLogged, expectOf: workExpect });
  let main: Work[];
  let caughtUp: Work[] = [];
  let stopped: Work[] = [];
  if (tab === "current") {
    // 見る・読むものがある（未消化がある）ものを上に。追いついたものはたたむ
    main = sorted.filter((w) => hasNext(w, handlers.today));
    caughtUp = sorted.filter((w) => !hasNext(w, handlers.today));
  } else if (tab === "partway") {
    // 既定は題名（読み仮名）順（漫画喫茶で探しやすいよう）。中断は一番下に「やめたもの」としてたたむ
    main = sorted.filter((w) => w.status !== "paused");
    stopped = sorted.filter((w) => w.status === "paused");
  } else {
    // 積読（予定＋所持）を先に
    main = [...sorted.filter(isTsundoku), ...sorted.filter((w) => !isTsundoku(w))];
  }
  const total = main.length + caughtUp.length + stopped.length;
  return (
    <>
      <ScrollHideBar>
      <div className="segmented" role="tablist">
        {CONTINUE_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={`seg${t.id === tab ? " on" : ""}`} onClick={() => { setTab(t.id); setMedium(null); }}>
            {t.label}
          </button>
        ))}
      </div>
      <MediumChips media={media} value={selectedMedium} onChange={setMedium} />
      {hasCafe && (
        <div className="chips">
          <button type="button" className={`chip${cafeOnly ? " on" : ""}`} aria-pressed={cafeOnly} onClick={() => setCafeOnly(!cafeOnly)}>
            漫喫で読む
          </button>
        </div>
      )}
      </ScrollHideBar>
      {total === 0 ? (
        <Empty text={EMPTY_TEXT[tab]} onAdd={onAdd} />
      ) : (
        <>
          <div className="records-tools">
            <p className="muted small count-line">{total}作品</p>
            <SortControl scope={sortScope} value={sortPref} onChange={setSortPref} />
          </div>
          {main.length > 0 && (
            <section className="card list-card">
              <ul className="work-list">
                {main.map((w) => (
                  <WorkCard key={w.id} work={w} {...handlers} />
                ))}
              </ul>
            </section>
          )}
          {main.length === 0 && tab === "current" && <p className="muted small center">いま見る・読むものはありません。</p>}
          {caughtUp.length > 0 && (
            <section className="card list-card">
              <button type="button" className="list-head link-head" aria-expanded={caughtUpOpen} onClick={() => setCaughtUpOpen(!caughtUpOpen)}>
                <h2>追いついている（{caughtUp.length}作品）</h2>
                <Icon name={caughtUpOpen ? "chevron-up" : "chevron-down"} size={18} />
              </button>
              {caughtUpOpen && (
                <ul className="work-list">
                  {caughtUp.map((w) => (
                    <WorkCard key={w.id} work={w} {...handlers} />
                  ))}
                </ul>
              )}
            </section>
          )}
          {stopped.length > 0 && (
            <section className="card list-card">
              <button type="button" className="list-head link-head" aria-expanded={stoppedOpen} onClick={() => setStoppedOpen(!stoppedOpen)}>
                <h2>やめたもの {stopped.length}件</h2>
                <Icon name={stoppedOpen ? "chevron-up" : "chevron-down"} size={18} />
              </button>
              {stoppedOpen && (
                <ul className="work-list">
                  {stopped.map((w) => (
                    <WorkCard key={w.id} work={w} {...handlers} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      <div className="fab-space" />
    </>
  );
}

export function RecordsView({ data, onOpen, enabledMedia }: { data: DataSet; onOpen: (item: RecordItem) => void; enabledMedia: Medium[] | null }) {
  const [mode, setMode] = useState<"list" | "grid">("list");
  const [medium, setMedium] = useState<Medium | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [yearOpen, setYearOpen] = useState(false);
  const built = useMemo(() => buildRecordItems(data), [data]);
  // 並び順（v0.19.0）：記録日の新しい順・古い順。1行＝記録1回
  const [sortPref, setSortPref] = useSortPref("records");
  const all = useMemo(() => (sortPref.dir === "asc" ? [...built].reverse() : built), [built, sortPref.dir]);
  const availableMedia = MEDIA.filter((m) => all.some((i) => i.work.medium === m));
  const media = visibleFilterMedia(availableMedia, enabledMedia);
  const selectedMedium = medium !== null && media.includes(medium) ? medium : null;
  const years = Array.from(new Set(all.map((i) => i.date.slice(0, 4)))).sort().reverse();
  const items = all.filter((i) => (selectedMedium === null || i.work.medium === selectedMedium) && (year === null || i.date.startsWith(year)));
  if (all.length === 0) return <Empty text="見た・読んだ記録はまだありません。映画・小説を登録するか、続きの作品を最後まで見ると、ここにたまります。" />;
  return (
    <>
      <ScrollHideBar>
        <MediumChips media={media} value={selectedMedium} onChange={setMedium} />
      </ScrollHideBar>
      <div className="records-tools">
        <p className="muted small count-line">{items.length}件</p>
        <div className="records-right">
          <SortControl scope="records" value={sortPref} onChange={setSortPref} />
          {years.length > 1 && (
            <button type="button" className="chip mini sort-pick" aria-label={`年：${year ? `${year}年` : "すべての年"}（押すと選ぶ）`} onClick={() => setYearOpen(true)}>
              {year ? `${year}年` : "すべての年"}
              <Icon name="chevron-down" size={14} />
            </button>
          )}
          {yearOpen && (
            <ChoiceSheet<string>
              title="年"
              options={[{ value: "", label: "すべての年" }, ...years.map((y) => ({ value: y, label: `${y}年` }))]}
              value={year ?? ""}
              onSelect={(v) => setYear(v || null)}
              onClose={() => setYearOpen(false)}
            />
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
              <button type="button" className="grid-tile" onClick={() => onOpen(r)}>
                <CoverImg work={r.work} />
                <span className="tile-date">{formatLogDate(r.date, r.log?.datePrecision, undefined, true)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// 今週（v0.21.0）：ホームの「今週の記録」をここへ移した
const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "今週" },
  { id: "month", label: "今月" },
  { id: "year", label: "今年" },
  { id: "all", label: "累計" },
];

export function SummaryView({ data, today, onOpen }: { data: DataSet; today: string; onOpen: (work: Work) => void }) {
  const [period, setPeriod] = useState<Period>("month");
  // 月のまとめを開いている月（YYYY-MM）。閉じているときは null
  const [openMonth, setOpenMonth] = useState<string | null>(null);
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
        {period === "month" && (
          <button type="button" className="secondary-btn month-open" onClick={() => setOpenMonth(today.slice(0, 7))}>
            今月のまとめを見る
          </button>
        )}
      </section>
      <section className="card">
        <h2>{today.slice(0, 4)}年の月ごとの記録</h2>
        <div className="bars" role="img" aria-label="月ごとの記録数">
          {months.map((n, i) => {
            const month = `${today.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
            const future = month > today.slice(0, 7);
            return (
              <button type="button" className="bar-col bar-btn" key={i} aria-label={future ? `${i + 1}月（未来）` : `${i + 1}月のまとめを開く（記録 ${n}件）`} disabled={future} onClick={() => setOpenMonth(month)}>
                <span className="bar-num">{n > 0 ? n : ""}</span>
                <span className="bar" style={{ height: `${(n / max) * 100}%` }} />
                <span className="bar-label">{i + 1}</span>
              </button>
            );
          })}
        </div>
        <p className="muted small">月を押すと、その月のまとめが開きます。</p>
      </section>
      {openMonth && (
        <MonthSummaryView data={data} month={openMonth} today={today} onChangeMonth={setOpenMonth} onBack={() => setOpenMonth(null)} onOpen={onOpen} />
      )}
      <p className="muted small center">{formatDate(today, today)}時点</p>
    </>
  );
}

/** 今期の一覧：今期のクールが付いた、進行中・予定の作品（最新の記録が配信のものは外す）。済になったものは下にたたむ */
export function CourView({ data, handlers, onBack }: { data: DataSet; handlers: CardHandlers; onBack: () => void }) {
  const [doneOpen, setDoneOpen] = useState(false);
  // 並び順（v0.20.0）：既定は放送枠（月曜から、同じ曜日は早い時刻から。枠の無い作品は最後に題名順）
  const [sortPref, setSortPref] = useSortPref("cour");
  const list = useMemo(() => currentCourList(data.works, data.logs, handlers.today), [data.works, data.logs, handlers.today]);
  const active = sortItems(list.active, sortPref, { work: (c) => c.work });
  const done = sortItems(list.done, sortPref, { work: (c) => c.work });
  return (
    <Screen title={`今期（${currentCourName(handlers.today)}）`} onBack={onBack}>
      {active.length === 0 && done.length === 0 ? (
        <Empty text="今期のクールが付いた作品はありません。作品の編集でクールを足すと、ここに並びます。" />
      ) : (
        <>
          {active.length > 0 && (
            <section className="card list-card">
              <div className="list-head">
                <h2>{active.length}作品</h2>
                <SortControl scope="cour" value={sortPref} onChange={setSortPref} />
              </div>
              <ul className="work-list">
                {active.map((c) => (
                  <WorkCard key={c.work.id} work={c.work} rerun={c.rerun} {...handlers} />
                ))}
              </ul>
            </section>
          )}
          {done.length > 0 && (
            <section className="card list-card">
              <button type="button" className="list-head link-head" aria-expanded={doneOpen} onClick={() => setDoneOpen(!doneOpen)}>
                <h2>視聴済（{done.length}作品）</h2>
                <Icon name={doneOpen ? "chevron-up" : "chevron-down"} size={18} />
              </button>
              {doneOpen && (
                <ul className="work-list">
                  {done.map((c) => (
                    <WorkCard key={c.work.id} work={c.work} rerun={c.rerun} {...handlers} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </Screen>
  );
}
