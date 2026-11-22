import { useEffect, useState } from "react";
import { CoverImg } from "./CoverImg";
import { CLEAR_LABEL, PURCHASE_STAGE_LABEL, UNIT_LABEL, accessText, expectLabel, purchaseFormatText, WEEKDAY_LABEL, doneWord, hasOngoingStatus, mediumTag, workPeopleLabel, workStateWord, workStatusWord } from "./constants";
import { canAddCurrentRerun, formatCour, subLabel, viaPlaceText } from "./courLogic";
import { formatDate, formatDateShort, formatLogDate, isoToDateKey, weekdayOf } from "./dateUtils";
import { Icon } from "./Icon";
import { availableCount, isTsundoku, isWaitingForNewVolume, latestLabel, ownedGapSummary, progressKindOf, roundsLabel, unconsumedCount } from "./progressLogic";
import { formatFuzzy, workExpect } from "./expectLogic";
import { unboughtVolumes, volumesText } from "./purchaseLogic";
import { MoreMenu, Screen, Stars } from "./Screen";
import type { Franchise, Log, Person, Work, WorkStatus } from "./types";
import { rangesDetailText, rangesText } from "./WorkEditor";
import { SortControl, useSortPref } from "./SortControl";
import { formatAirSlot } from "./airSlot";

const PLACE_LABEL = { home: "自宅", parents_home: "実家", both: "自宅と実家", unknown: "場所不明" } as const;

interface Props {
  work: Work;
  logs: Log[];
  franchise: Franchise | null;
  people: Person[];
  onOpenFranchise: (f: Franchise) => void;
  onOpenPerson: (p: Person) => void;
  /** 映像作品の関連LIVE・イベントの円盤（v0.20.0） */
  linkedWorks: { label: string; works: Work[] } | null;
  onOpenWork: (w: Work) => void;
  today: string;
  onBack: () => void;
  onEdit: () => void;
  onStep: (work: Work) => void;
  /** finish=true は「読み終えた」：保存したら作品を読了にする（読書中の小説） */
  onAddLog: (kind: Log["kind"], finish?: boolean) => void;
  onEditLog: (log: Log) => void;
  onSetStatus: (status: WorkStatus) => void;
  onDelete: () => void;
  /** マンガの巻を選んで「買った」「予約した」 */
  onPickVolumes: (mode: "buy" | "reserve") => void;
  /** ホームに出す積読にする（1冊だけ）／外す */
  onToggleHomePick: () => void;
  onNewVolume: () => void;
  onStartAgain: () => void;
  /** 今期の再放送のクールを足す（アニメ・ドラマ） */
  onAddRerun: () => void;
}

type FactItem = { label: string; value: string | null | undefined };

/** 項目名を上、値を下に置く2列の並び（v0.21.0）。長い値だけ横いっぱいに使う */
function Facts({ items }: { items: FactItem[] }) {
  const shown = items.filter((x): x is { label: string; value: string } => Boolean(x.value));
  if (shown.length === 0) return null;
  return (
    <dl className="facts">
      {shown.map((x) => (
        <div key={x.label} className={`fact${x.value.length > 12 ? " wide" : ""}`}>
          <dt>{x.label}</dt>
          <dd>{x.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function WorkDetail({ work, logs, franchise, people, onOpenFranchise, onOpenPerson, linkedWorks, onOpenWork, today, onBack, onEdit, onStep, onAddLog, onEditLog, onSetStatus, onDelete, onPickVolumes, onToggleHomePick, onNewVolume, onStartAgain, onAddRerun }: Props) {
  const unbought = unboughtVolumes(work);
  const gaps = ownedGapSummary(work);
  const [menu, setMenu] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const hasCover = Boolean(work.coverPhotoId || work.coverUrl);
  useEffect(() => {
    if (!coverOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCoverOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [coverOpen]);
  const kind = progressKindOf(work);
  const unconsumed = unconsumedCount(work, today);
  // 読書中・中断の小説：記録を書くと読了になる入口を主ボタンにする
  const readingNovel = work.medium === "novel" && (work.status === "active" || work.status === "paused");
  // 記録の並び（v0.19.0）：新しい順・古い順を切り替えられる（端末に記憶）
  const [logSort, setLogSort] = useSortPref("work-logs");
  const newestFirst = [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const sorted = logSort.dir === "asc" ? newestFirst.reverse() : newestFirst;
  const statusItems: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (kind !== "none") {
    if (work.status === "done") statusItems.push({ label: work.medium === "manga" ? "もう一度読む（最初から）" : "もう一度見る（最初から）", onClick: onStartAgain });
    if (work.status !== "active") statusItems.push({ label: work.status === "done" ? "続きに戻す（今の位置のまま）" : "進行中にする", onClick: () => onSetStatus("active") });
    if (work.status === "active") statusItems.push({ label: "中断にする", onClick: () => onSetStatus("paused") });
    if (work.status !== "done") statusItems.push({ label: work.medium === "manga" ? "読み終えた（記録へ）" : "見終えた（記録へ）", onClick: () => onSetStatus("done") });
  } else if (hasOngoingStatus(work.medium)) {
    // ゲーム・小説は続きを数えないが、途中（プレイ中・読書中）と中断を持つ
    for (const s of ["active", "paused", "done", "wish"] as const) {
      if (work.status === s) continue;
      // 小説を読み終えたら、状態だけ変えずに記録（読んだ日・星・感想）の入力を開く
      if (s === "done" && work.medium === "novel") statusItems.push({ label: "読み終えた（記録を書く）", onClick: () => onAddLog("view", true) });
      else statusItems.push({ label: `${workStatusWord(work, s)}にする`, onClick: () => onSetStatus(s) });
    }
  } else {
    if (work.status === "wish") statusItems.push({ label: `${workStatusWord(work, "done")}にする`, onClick: () => onSetStatus("done") });
    else statusItems.push({ label: `${workStatusWord(work, "wish")}に戻す`, onClick: () => onSetStatus("wish") });
  }
  if (work.status !== "wish" && kind !== "none") statusItems.push({ label: `${workStatusWord(work, "wish")}にする`, onClick: () => onSetStatus("wish") });
  if (isTsundoku(work)) statusItems.push({ label: work.homePick ? "ホームに出す積読から外す" : "ホームに出す積読にする", onClick: onToggleHomePick });
  // まれな操作は「…」へ（v0.21.0。以前は作品ページのボタンの並びにあった）
  if ((work.medium === "anime" || work.medium === "drama") && canAddCurrentRerun(work, today)) statusItems.push({ label: "今期の再放送を足す", onClick: onAddRerun });
  statusItems.push({ label: "作品を削除", danger: true, onClick: onDelete });

  const schedule = work.schedule;
  const available = availableCount(work, today);
  const unit = UNIT_LABEL[kind];
  // 続きの位置：最後まで見た作品で位置が分からないとき（出演作の取り込みなど）は出さない
  const showProgress = (kind === "episode" || kind === "volume") && !(work.status === "done" && work.progress === null);
  const pct = available ? Math.min(100, Math.round(((work.progress ?? 0) / available) * 100)) : 0;
  const placeText = work.owned?.place ? PLACE_LABEL[work.owned.place] : null;
  const formatText = purchaseFormatText(work.purchase.format, work.purchase.store);
  const purchaseText = work.purchase.stage === "none" ? null : PURCHASE_STAGE_LABEL[work.purchase.stage] + (formatText ? `（${formatText}）` : "") + (work.shelfPlace ? `（${PLACE_LABEL[work.shelfPlace]}）` : "");
  const expect = workExpect(work);
  const volumeDates = work.owned?.volumeDates ?? [];
  const showCours = work.cours.length > 0;
  // 週刊誌：記録の並びを年ごとに区切る（データは変えない）
  const yearOf = (l: Log) => l.date.slice(0, 4);
  const doneAt = kind !== "none" && work.status === "done" && work.completedAt ? work.completedAt : null;
  const hasWorkFacts = Boolean(schedule || work.airSlot || work.workState || expect || work.partLabel || showCours || work.access || work.edition || work.platform || work.clearLevel || doneAt);
  const hasBuyFacts = Boolean(purchaseText || work.owned?.ranges.length || work.buying || work.owned?.reserved.length || gaps.count > 0 || placeText || volumeDates.length);
  const hasInfoCard = hasWorkFacts || hasBuyFacts || work.medium === "manga" || people.length > 0 || Boolean(linkedWorks && linkedWorks.works.length > 0) || Boolean(work.memo);
  const heroFlags = [
    isWaitingForNewVolume(work, today) ? "新刊待ち" : "",
    isTsundoku(work) ? (work.homePick ? "積読（ホームに出す）" : "積読") : "",
    work.rounds >= 2 ? roundsLabel(work) : "",
    work.isOriginal ? "原作" : "",
  ].filter(Boolean);
  return (
    <Screen
      title={work.title}
      onBack={onBack}
      actions={
        <>
          <button type="button" className="icon-btn" aria-label="編集" onClick={onEdit}>
            <Icon name="pencil" size={20} />
          </button>
          <MoreMenu open={menu} onToggle={() => setMenu(!menu)} items={statusItems} />
        </>
      }
    >
      <section className="card">
        <div className="hero">
          {hasCover ? (
            <button type="button" className="hero-cover-button" aria-label="表紙を拡大" onClick={() => setCoverOpen(true)}>
              <CoverImg work={work} className="hero-cover" lazy={false} size="full" />
            </button>
          ) : <CoverImg work={work} className="hero-cover" lazy={false} size="full" />}
          <div className="hero-body">
            <h2 className="hero-title">{work.title}</h2>
            {subLabel(work) && <p className="hero-sub">{subLabel(work)}</p>}
            <div className="hero-tags">
              <span className="medium-tag">{mediumTag(work)}</span>
              <span className={`status-pill s-${work.status}`}>{workStatusWord(work, work.status)}</span>
            </div>
            {/* 状態以外の目印は札にせず、1行の文字で（v0.21.0） */}
            {heroFlags.length > 0 && <p className="hero-flags">{heroFlags.join("・")}</p>}
            {franchise && (
              <button type="button" className="hero-link" onClick={() => onOpenFranchise(franchise)}>
                シリーズ：{franchise.title} <Icon name="chevron-right" size={14} />
              </button>
            )}
          </div>
        </div>

        {showProgress && (
          <div className="progress-box">
            <div className="progress-line">
              <span className="progress-now">
                {work.progress ? <><strong>{work.progress}</strong>{kind === "episode" ? "話まで見た" : "巻まで読んだ"}</> : kind === "episode" ? "まだ見ていない" : "まだ読んでいない"}
              </span>
              {unconsumed !== null && unconsumed > 0 && <span className="progress-left">あと{unconsumed}{unit}</span>}
            </div>
            {available !== null && available > 0 && (
              <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={available} aria-valuenow={work.progress ?? 0}>
                <span style={{ width: `${pct}%` }} />
              </div>
            )}
            {latestLabel(work, today) && <p className="progress-note">{latestLabel(work, today)}</p>}
          </div>
        )}
        {kind === "issue" && (
          <div className="progress-box">
            <div className="progress-line">
              <span className="progress-now">{work.readThrough ? `${formatDate(work.readThrough, today)}発売の号まで読んだ` : "まだ読んでいない"}</span>
              {unconsumed !== null && unconsumed > 0 && <span className="progress-left">あと{unconsumed}号</span>}
            </div>
          </div>
        )}

        {/* 操作（v0.21.0）：主な操作を1つだけ横いっぱいに。ほかは2つまで横に並べ、まれな操作は右上の「…」へ */}
        <div className="detail-actions">
          {kind !== "none" && work.status !== "done" ? (
            <button type="button" className="primary-btn wide-btn" onClick={() => onStep(work)}>
              <Icon name="plus" size={18} /> 次の{unit}を記録
            </button>
          ) : readingNovel ? (
            <button type="button" className="primary-btn wide-btn" onClick={() => onAddLog("view", true)}>
              読み終えた（記録を書く）
            </button>
          ) : kind === "none" ? (
            <button type="button" className="primary-btn wide-btn" onClick={() => onAddLog("view")}>
              {doneWord(work.medium)}記録を追加
            </button>
          ) : null}
          {kind !== "none" && (
            <div className="sub-actions">
              {work.status !== "done" && (
                <button type="button" className="secondary-btn" onClick={() => onAddLog("progress")}>
                  日付を選んで記録
                </button>
              )}
              {!readingNovel && (
                <button type="button" className={work.status === "done" ? "primary-btn" : "secondary-btn"} onClick={() => onAddLog("view")}>
                  感想を残す
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 情報は1枚のカードにまとめる（v0.21.2）。節ごとに小見出しと細い線で区切り、カードは増やさない */}
      {hasInfoCard && (
      <section className="card info-card">
      {hasWorkFacts && (
        <div className="info-block">
          <h3 className="info-head">作品</h3>
          <Facts
            items={[
              { label: kind === "issue" ? "発売" : "放送", value: schedule ? `毎週${WEEKDAY_LABEL[weekdayOf(schedule.firstDate)]}曜日` : null },
              { label: "放送枠", value: work.airSlot ? `${formatAirSlot(work.airSlot)}${work.airSlot.source === "anilist" ? "（AniList）" : ""}` : null },
              { label: "作品", value: work.workState ? workStateWord(work.medium, work.workState) : null },
              { label: expectLabel(work.medium), value: expect ? formatFuzzy(expect, today) : null },
              { label: "期・編・巻", value: work.partLabel },
              { label: "クール", value: showCours ? work.cours.map(formatCour).join("、") : null },
              { label: "休みの週", value: schedule && schedule.skipDates.length > 0 ? [...schedule.skipDates].sort().map((x) => formatDateShort(x)).join("、") : null },
              { label: work.medium === "manga" ? "読む手段" : "見る手段", value: work.access ? accessText(work.access, work.accessStore) : null },
              { label: "版", value: work.edition },
              { label: "ハード", value: work.platform },
              { label: "どこまで", value: work.clearLevel ? CLEAR_LABEL[work.clearLevel] : null },
              { label: work.medium === "manga" ? "読み終えた日" : "見終えた日", value: doneAt ? formatDate(isoToDateKey(doneAt), today) : null },
            ]}
          />
        </div>
      )}

      {(hasBuyFacts || work.medium === "manga") && (
        <div className="info-block">
          <h3 className="info-head">購入・所持</h3>
          <Facts
            items={[
              { label: "購入", value: purchaseText },
              { label: "所持の巻", value: work.owned?.ranges.length ? `${rangesDetailText(work.owned.ranges)}巻` : null },
              { label: "新刊", value: work.buying ? (unbought.length > 0 ? `続きの巻も買う・まだ買っていない ${volumesText(unbought)}巻` : "続きの巻も買う・買い終わっている") : null },
              { label: "予約済の巻", value: work.owned?.reserved.length ? `${rangesText(work.owned.reserved)}巻` : null },
              { label: "抜け", value: gaps.count > 0 ? `${gaps.count}巻（${gaps.text}）` : null },
              { label: "置き場所", value: placeText },
              { label: "巻ごとの発売日", value: volumeDates.length ? volumeDates.map((v) => `${v.volume}巻 ${formatFuzzy(v.date, today)}`).join("、") : null },
            ]}
          />
          {work.medium === "manga" && (
            <div className="sub-actions">
              {work.buying && <button type="button" className="secondary-btn" onClick={onNewVolume}>新刊が出た</button>}
              <button type="button" className="secondary-btn" onClick={() => onPickVolumes("buy")}>買った巻</button>
              <button type="button" className="secondary-btn" onClick={() => onPickVolumes("reserve")}>予約した巻</button>
            </div>
          )}
        </div>
      )}

      {(people.length > 0 || (linkedWorks && linkedWorks.works.length > 0)) && (
        <div className="info-block">
          {people.length > 0 && (
            <div className="chip-block">
              <h3 className="info-head">{workPeopleLabel(work)}</h3>
              <div className="chips">
                {people.map((p) => (
                  <button key={p.id} type="button" className="chip mini" onClick={() => onOpenPerson(p)}>{p.name}</button>
                ))}
              </div>
            </div>
          )}
          {linkedWorks && linkedWorks.works.length > 0 && (
            <div className="chip-block">
              <h3 className="info-head">{linkedWorks.label}</h3>
              <div className="chips">
                {linkedWorks.works.map((x) => (
                  <button key={x.id} type="button" className="chip mini" onClick={() => onOpenWork(x)}>{x.title}{x.partLabel ? ` ${x.partLabel}` : ""}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {work.memo && (
        <div className="info-block">
          <h3 className="info-head">メモ</h3>
          <p className="memo-text">{work.memo}</p>
        </div>
      )}
      </section>
      )}

      {work.setlist && (
        <section className="card">
          <h2 className="card-title">セットリスト</h2>
          <ol className="setlist">{work.setlist.split(/\n+/).filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}</ol>
        </section>
      )}

      <section className="card list-card">
        <div className="list-head">
          <h2>記録</h2>
          <span className="muted small">{sorted.length}件</span>
          {sorted.length > 1 && <SortControl scope="work-logs" value={logSort} onChange={setLogSort} />}
        </div>
        {sorted.length === 0 ? (
          <p className="muted pad">まだ記録はありません。</p>
        ) : (
          <ul className="list">
            {sorted.map((l, i) => (
              <li key={l.id}>
                {work.medium === "magazine" && (i === 0 || yearOf(sorted[i - 1]) !== yearOf(l)) && <p className="year-head">{yearOf(l)}年</p>}
                <button type="button" className="list-row" onClick={() => onEditLog(l)}>
                  <span className="list-main">
                    <span className="list-name">
                      {formatLogDate(l.date, l.datePrecision, today)}
                      {l.position ? `　第${l.position}${unit || "回"}` : ""}
                      {l.issueDate ? `　${formatDateShort(l.issueDate)}発売の号` : ""}
                    </span>
                    {viaPlaceText(l) && <span className="list-sub">{viaPlaceText(l)}</span>}
                    {l.note && <span className="list-sub wrap note-excerpt">{l.note}</span>}
                  </span>
                  {l.rating ? <Stars value={l.rating} /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {coverOpen && (
        <div className="cover-viewer" role="dialog" aria-modal="true" aria-label={`${work.title}の表紙`} onClick={() => setCoverOpen(false)}>
          <CoverImg work={work} className="cover-viewer-image" lazy={false} size="full" />
          <button type="button" className="cover-viewer-close" aria-label="表紙を閉じる" onClick={() => setCoverOpen(false)}>
            <Icon name="close" size={24} />
          </button>
        </div>
      )}
    </Screen>
  );
}
