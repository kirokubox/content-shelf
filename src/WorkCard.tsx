import { useRef } from "react";
import { subLabel } from "./courLogic";
import { CoverImg } from "./CoverImg";
import { LONG_PRESS_MS, UNIT_LABEL, mediumTag } from "./constants";
import { formatDateShort, isoToDateKey } from "./dateUtils";
import { Icon } from "./Icon";
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
  return (
    <li className="work-card">
      <CoverImg work={work} className="cover-thumb card-cover" onClick={() => onOpen(work)} />
      <div className="work-body">
        <button type="button" className="work-main" onClick={() => onOpen(work)}>
          <span className="work-title">
            {work.title}
            {subLabel(work) && <span className="work-season"> {subLabel(work)}</span>}
          </span>
          <span className="work-sub">
            <span className="medium-tag">{mediumTag(work)}</span>
            {[position, latest].filter(Boolean).join("・")}
          </span>
          <span className="work-sub dim">
            最終 {formatDateShort(isoToDateKey(work.touchedAt))}
            {isWaitingForNewVolume(work, today) && <span className="wait-note">新刊待ち</span>}
            {isTsundoku(work) && <span className="wait-note">積読</span>}
            {rerun && <span className="wait-note">再放送</span>}
            {work.rounds >= 2 && <span className="wait-note">{roundsLabel(work)}</span>}
            {work.access === "manga_cafe" && <span className="wait-note">漫喫</span>}
            {gaps.count > 0 && <span className="gap-note">抜け {gaps.count}巻</span>}
          </span>
        </button>
        {work.medium === "novel" && work.status === "active" && onFinish && (
          <button type="button" className="buy-btn" aria-label={`${work.title}を読み終えた（記録を書く）`} onClick={() => onFinish(work)}>
            読み終えた
          </button>
        )}
      </div>
      {work.status === "active" && unconsumed !== null && unconsumed > 0 && (
        <span className="unconsumed" aria-label={`あと${unconsumed}${UNIT_LABEL[kind]}`}>
          <span className="unconsumed-label">あと</span>
          <span className="unconsumed-num">{unconsumed}<span className="unconsumed-unit">{UNIT_LABEL[kind]}</span></span>
        </span>
      )}
      {kind !== "none" && work.status === "active" && (
        <button type="button" className="step-btn" aria-label={`次の${UNIT_LABEL[kind]}を記録（長押しで日付を選ぶ）`} {...press}>
          <Icon name="plus" size={16} />
          <span>1{UNIT_LABEL[kind]}</span>
        </button>
      )}
    </li>
  );
}
