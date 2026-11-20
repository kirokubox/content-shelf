// 購入画面（v0.17.0）：買う予定／予約済み／持ってる。マンガは巻を選んで「買った」「予約した」
import { useMemo, useState } from "react";
import { BottomSheet } from "./BottomSheet";
import { CoverImg } from "./CoverImg";
import { DIGITAL_STORE_LABEL, MEDIUM_LABEL, PURCHASE_STAGE_LABEL, expectLabel, mediumTag, purchaseFormatText } from "./constants";
import { subLabel } from "./courLogic";
import { formatFuzzy } from "./expectLogic";
import { SegRow } from "./formParts";
import { visibleFilterMedia } from "./mediaPrefs";
import { defaultShape, purchaseList, unboughtVolumes, volumeList, volumesText } from "./purchaseLogic";
import { SortControl, useSortPref } from "./SortControl";
import { sortItems } from "./sortLogic";
import type { SortScope } from "./sortLogic";
import type { PurchaseItem, PurchaseTab, Shape } from "./purchaseLogic";
import type { DataSet, DigitalStore, Medium, RangeMedium, Work } from "./types";
import { DIGITAL_STORES, MEDIA } from "./types";
import { parseRanges, rangesDetailText } from "./WorkEditor";

const TABS: { id: PurchaseTab; label: string }[] = [
  { id: "planned", label: PURCHASE_STAGE_LABEL.planned },
  { id: "reserved", label: PURCHASE_STAGE_LABEL.reserved },
  { id: "owned", label: PURCHASE_STAGE_LABEL.owned },
];

const EMPTY: Record<PurchaseTab, string> = {
  planned: "買う予定のものはありません。作品の編集で購入を「買う予定」にするか、マンガに「続きの巻も買う」の印を付けると、ここに並びます。",
  reserved: "予約しているものはありません。",
  owned: "持っているものはありません。",
};

export interface PurchaseHandlers {
  onOpen: (work: Work) => void;
  /** マンガの巻を選ぶシートを開く */
  onPickVolumes: (work: Work, mode: "buy" | "reserve") => void;
  /** 単巻のものの段階を変える */
  onSetStage: (work: Work, stage: "reserved" | "owned") => void;
}

function itemLine(item: PurchaseItem, tab: PurchaseTab): string {
  const w = item.work;
  if (w.medium === "manga") {
    if (tab === "planned") {
      if (item.volumes.length === 0) return "既刊を入れると、まだ買っていない巻が出ます";
      return `まだ買っていない：${volumesText(item.volumes)}巻（${item.volumes.length}冊）`;
    }
    if (tab === "reserved") return item.volumes.length > 0 ? `予約中：${volumesText(item.volumes)}巻` : "予約済み（巻は未設定）";
    return w.owned?.ranges.length ? `${rangesDetailText(w.owned.ranges)}巻` : "持ってる（巻は未設定）";
  }
  return purchaseFormatText(w.purchase.format, w.purchase.store);
}

function PurchaseRow({ item, tab, today, handlers }: { item: PurchaseItem; tab: PurchaseTab; today: string; handlers: PurchaseHandlers }) {
  const w = item.work;
  const manga = w.medium === "manga";
  const line = itemLine(item, tab);
  return (
    <li className={`work-card purchase-card${item.overdue ? " overdue" : ""}`}>
      <CoverImg work={w} className="cover-thumb card-cover" onClick={() => handlers.onOpen(w)} />
      <div className="work-body">
        <button type="button" className="work-main" onClick={() => handlers.onOpen(w)}>
          <span className="work-title">
            {w.title}
            {subLabel(w) && <span className="work-season"> {subLabel(w)}</span>}
          </span>
          <span className="work-sub">
            <span className="medium-tag">{mediumTag(w)}</span>
            <span className="purchase-line">{line}</span>
          </span>
          {item.date && (
            <span className={`work-sub${item.overdue ? " overdue-note" : " dim"}`}>
              {expectLabel(w.medium)} {formatFuzzy(item.date, today)}
              {item.overdue && "（過ぎています。買ったら「買った」に）"}
            </span>
          )}
        </button>
        {tab !== "owned" && (
          <div className="purchase-actions">
            {tab === "planned" && (
              <button type="button" className="secondary-btn small-btn" onClick={() => (manga ? handlers.onPickVolumes(w, "reserve") : handlers.onSetStage(w, "reserved"))}>
                予約した
              </button>
            )}
            <button type="button" className="buy-btn" onClick={() => (manga ? handlers.onPickVolumes(w, "buy") : handlers.onSetStage(w, "owned"))}>
              買った
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function PurchaseView({ data, today, handlers, enabledMedia }: { data: DataSet; today: string; handlers: PurchaseHandlers; enabledMedia: Medium[] | null }) {
  const [tab, setTab] = useState<PurchaseTab>("planned");
  const [medium, setMedium] = useState<Medium | null>(null);
  // 並び順（v0.19.0）：タブごとに記憶。「発売日を過ぎても予約済み」の枠は崩さず、枠の中だけ並べ替える
  const sortScope: SortScope = tab === "planned" ? "purchase-planned" : tab === "reserved" ? "purchase-reserved" : "purchase-owned";
  const [sortPref, setSortPref] = useSortPref(sortScope);
  const all = useMemo(
    () => sortItems(purchaseList(data.works, tab, today), sortPref, { work: (i) => i.work, expect: (i) => i.date }),
    [data.works, tab, today, sortPref],
  );
  const media = visibleFilterMedia(MEDIA.filter((m) => all.some((i) => i.work.medium === m)), enabledMedia);
  const selected = medium !== null && media.includes(medium) ? medium : null;
  const shown = all.filter((i) => selected === null || i.work.medium === selected);
  const overdue = shown.filter((i) => i.overdue);
  const rest = shown.filter((i) => !i.overdue);
  return (
    <>
      <div className="segmented" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={`seg${t.id === tab ? " on" : ""}`} onClick={() => { setTab(t.id); setMedium(null); }}>
            {t.label}
          </button>
        ))}
      </div>
      {media.length >= 2 && (
        <div className="chips scroll-chips">
          <button type="button" className={`chip${selected === null ? " on" : ""}`} onClick={() => setMedium(null)}>すべて</button>
          {media.map((m) => (
            <button key={m} type="button" className={`chip${selected === m ? " on" : ""}`} onClick={() => setMedium(m)}>{MEDIUM_LABEL[m]}</button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <div className="empty"><p>{EMPTY[tab]}</p></div>
      ) : (
        <>
          <div className="records-tools">
            <p className="muted small count-line">{shown.length}件</p>
            <SortControl scope={sortScope} value={sortPref} onChange={setSortPref} />
          </div>
          {overdue.length > 0 && (
            <section className="card list-card overdue-card">
              <p className="pad small overdue-head">発売日を過ぎても予約済みのもの（{overdue.length}件）</p>
              <ul className="work-list">
                {overdue.map((i) => <PurchaseRow key={i.work.id} item={i} tab={tab} today={today} handlers={handlers} />)}
              </ul>
            </section>
          )}
          {rest.length > 0 && (
            <section className="card list-card">
              <ul className="work-list">
                {rest.map((i) => <PurchaseRow key={i.work.id} item={i} tab={tab} today={today} handlers={handlers} />)}
              </ul>
            </section>
          )}
        </>
      )}
      <div className="fab-space" />
    </>
  );
}

/** 形の選択（紙／電子 → Kindle・ジャンプ＋・その他） */
export function ShapeFields({ shape, onChange }: { shape: Shape; onChange: (s: Shape) => void }) {
  return (
    <>
      <SegRow label="形" value={shape.medium} choices={[{ value: "paper" as RangeMedium, label: "紙" }, { value: "digital" as RangeMedium, label: "電子" }]} onChange={(m) => onChange({ medium: m, store: m === "digital" ? shape.store : null })} clearValue={null} />
      {shape.medium === "digital" && (
        <SegRow label="電子" value={shape.store} choices={DIGITAL_STORES.map((x) => ({ value: x as DigitalStore | null, label: DIGITAL_STORE_LABEL[x] }))} onChange={(x) => onChange({ ...shape, store: x })} clearValue={null} />
      )}
    </>
  );
}

/**
 * マンガの巻を選んで「買った」「予約した」。
 * 買った：まだ買っていない巻と予約中の巻から選ぶ（予約中の巻は予約から外れて持っている巻へ）。予約した：まだ買っていない巻から選ぶ。
 * 持っている巻は出さないので、同じ巻を2回買えない。候補に無い巻は番号で入れられる
 */
export function VolumePickSheet({ work, mode, onClose, onConfirm }: { work: Work; mode: "buy" | "reserve"; onClose: () => void; onConfirm: (nums: number[], shape: Shape) => void }) {
  const unbought = unboughtVolumes(work);
  const reserved = volumeList(work.owned?.reserved);
  const owned = new Set(volumeList(work.owned?.ranges));
  const reservedSet = new Set(reserved);
  const candidates = (mode === "buy" ? Array.from(new Set([...reserved, ...unbought])) : unbought).sort((a, b) => a - b);
  // 最初に選んでおく巻：買った＝予約中の巻があればそれ、無ければ次の1冊。予約した＝次の1冊
  const [picked, setPicked] = useState<Set<number>>(() => new Set(mode === "buy" && reserved.length > 0 ? reserved : candidates.slice(0, 1)));
  const [extra, setExtra] = useState("");
  const [shape, setShape] = useState<Shape>(() => defaultShape(work));
  const [error, setError] = useState("");
  const toggle = (n: number) => setPicked((cur) => {
    const next = new Set(cur);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    return next;
  });
  const confirm = () => {
    const nums = new Set(picked);
    if (extra.trim()) {
      const parsed = parseRanges(extra.normalize("NFKC"));
      if (!parsed) return setError("巻の番号は「12」「14-15」のように入れてください");
      for (const r of parsed) for (let n = r.from; n <= r.to && n - r.from < 5000; n += 1) nums.add(n);
    }
    const list = Array.from(nums).sort((a, b) => a - b);
    if (list.length === 0) return setError(mode === "buy" ? "買った巻を選んでください" : "予約した巻を選んでください");
    const dupOwned = list.filter((n) => owned.has(n));
    if (dupOwned.length > 0) return setError(`${volumesText(dupOwned)}巻はもう持っています`);
    if (mode === "reserve") {
      const dupRes = list.filter((n) => reservedSet.has(n));
      if (dupRes.length > 0) return setError(`${volumesText(dupRes)}巻はもう予約しています`);
    }
    onConfirm(list, shape);
  };
  return (
    <BottomSheet title={`${work.title}：${mode === "buy" ? "買った巻" : "予約した巻"}`} onClose={onClose}>
      <div className="form compact">
        {candidates.length > 0 ? (
          <div className="field">
            <span className="field-label">{mode === "buy" ? "まだ買っていない巻・予約中の巻" : "まだ買っていない巻"}</span>
            <div className="chips vol-chips">
              {candidates.map((n) => (
                <button key={n} type="button" className={`chip${picked.has(n) ? " on" : ""}`} aria-pressed={picked.has(n)} onClick={() => toggle(n)}>
                  {n}巻{reservedSet.has(n) ? "（予約中）" : ""}
                </button>
              ))}
            </div>
            {candidates.length > 1 && (
              <div className="vol-quick">
                <button type="button" className="text-btn" onClick={() => setPicked(new Set(candidates))}>すべて選ぶ</button>
                <button type="button" className="text-btn" onClick={() => setPicked(new Set())}>選ぶのをやめる</button>
              </div>
            )}
          </div>
        ) : (
          <p className="muted small">候補の巻がありません（既刊が分からないか、全部持っています）。下に巻の番号を入れてください。</p>
        )}
        <label className="field">
          <span className="field-label">そのほかの巻（番号で）</span>
          <input className="text-input" inputMode="numeric" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="例：12, 14-15" />
        </label>
        <ShapeFields shape={shape} onChange={setShape} />
        {error && <p className="field-error">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>やめる</button>
          <button type="button" className="primary-btn" onClick={confirm}>{mode === "buy" ? "買ったにする" : "予約したにする"}</button>
        </div>
      </div>
    </BottomSheet>
  );
}
