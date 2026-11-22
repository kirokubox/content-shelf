import { useRef } from "react";
import { subLabel } from "./courLogic";
import { CoverImg } from "./CoverImg";
import { LONG_PRESS_MS, UNIT_LABEL, mediumTag } from "./constants";
import { expectVerb, formatFuzzy, workExpect } from "./expectLogic";
import { formatDateShort, isoToDateKey } from "./dateUtils";
import { Icon } from "./Icon";
import { formatAirSlot } from "./airSlot";
import { isTsundoku, isWaitingForNewVolume, latestLabel, ownedGapSummary, positionLabel, progressKindOf, roundsLabel, unconsumedCount } from "./progressLogic";
import type { Work } from "./types";

/** 押して離したら onTap、長押しなら onLong（＋1の長押しで日付を選ぶ） */
function useLongPress(onTap: () => void, onLong: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  return {
    onPointerDown: () => {
      fired.current = false;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => window.clearTimeout(timer.current),
    onPointerLeave: () => window.clearTimeout(timer.current),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!fired.current) onTap();
    },
  };
}

interface Props {
  work: Work;
  today: string;
  onOpen: (work: Work) => void;
  onStep: (work: Work) => void;
  onStepWithDate: (work: Work) => void;
  /** 読書中の小説の「読み終えた」：記録の入力を開く */
  onFinish?: (work: Work) => void;
  /** 今期の再放送として出すとき */
  rerun?: boolean;
}

export function WorkCard({ work, today, onOpen, onStep, onStepWithDate, onFinish, rerun }: Props) {
  const gaps = ownedGapSummary(work);
  const kind = progressKindOf(work);
  const unconsumed = unconsumedCount(work, today);
  const press = useLongPress(() => onStep(work), () => onStepWithDate(work));
  const position = kind === "issue" && work.readThrough ? `${formatDateShort(work.readThrough)}発売の号まで` : positionLabel(work);
  const latest = latestLabel(work, today);
  // 楽しみの日（開催・公開・発売・放送開始）。済の作品には出さない
  const expect = work.status !== "done" ? workExpect(work) : null;
  const showLeft = work.status === "active" && unconsumed !== null && unconsumed > 0;
  // その作品だけの目印。強調はせず、日付と同じ行に並べる
  const notes = [
    work.airSlot && (work.medium === "anime" || work.medium === "drama") && work.status !== "done" ? formatAirSlot(work.airSlot) : "",
    isWaitingForNewVolume(work, today) ? "新刊待ち" : "",
    isTsundoku(work) ? "積読" : "",
    rerun ? "再放送" : "",
    work.rounds >= 2 ? roundsLabel(work) : "",
    work.access === "manga_cafe" ? "漫喫" : "",
  ].filter(Boolean);
  return (
    <li className="work-card">
      <CoverImg work={work} className="cover-thumb card-cover" onClick={() => onOpen(work)} />
      <div className="work-body">
        <button type="button" className="work-main" onClick={() => onOpen(work)}>
          <span className="work-title">
            {work.title}
            {subLabel(work) && <span className="work-season"> {subLabel(work)}</span>}
          </span>
          {/* 2行目：種類・進み具合・あと何話・出ている最新（札にせず、1行の文字で読む）。
              幅が足りないときは末尾が「…」で切れるので、いちばん大事な「あと何話」を最新より先に置く（v0.21.1） */}
          <span className="work-sub">
            <span className="meta-line">
              {[mediumTag(work), position].filter(Boolean).join("・")}
              {showLeft && <span className="left-note">・あと{unconsumed}{UNIT_LABEL[kind]}</span>}
              {latest && `・${latest}`}
            </span>
          </span>
          {/* 3行目：日付と、その作品だけの目印 */}
          <span className="work-sub dim">
            <span className="meta-line">
              {/* 予定の作品は「いつ登録したか」、それ以外は最後に触った日 */}
              {work.status === "wish" ? `登録 ${formatDateShort(isoToDateKey(work.createdAt))}` : `最終 ${formatDateShort(isoToDateKey(work.touchedAt))}`}
              {notes.length > 0 && `・${notes.join("・")}`}
              {expect && <span className="expect-note">・{expectVerb(work.medium)} {formatFuzzy(expect, today)}</span>}
              {gaps.count > 0 && <span className="gap-note">・抜け {gaps.count}巻</span>}
            </span>
          </span>
        </button>
        {work.medium === "novel" && work.status === "active" && onFinish && (
          <button type="button" className="buy-btn" aria-label={`${work.title}を読み終えた（記録を書く）`} onClick={() => onFinish(work)}>
            読み終えた
          </button>
        )}
      </div>
      {kind !== "none" && work.status === "active" && (
        <button type="button" className="step-btn" aria-label={`次の${UNIT_LABEL[kind]}を記録（長押しで日付を選ぶ）`} {...press}>
          <Icon name="plus" size={16} />
          <span>1{UNIT_LABEL[kind]}</span>
        </button>
      )}
    </li>
  );
}
