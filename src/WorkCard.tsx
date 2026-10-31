import { useRef } from "react";
import { LONG_PRESS_MS, MEDIUM_LABEL, UNIT_LABEL } from "./constants";
import { formatDateShort, isoToDateKey } from "./dateUtils";
import { Icon } from "./Icon";
import { latestLabel, positionLabel, progressKindOf, unconsumedCount } from "./progressLogic";
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
}

export function WorkCard({ work, today, onOpen, onStep, onStepWithDate }: Props) {
  const kind = progressKindOf(work);
  const unconsumed = unconsumedCount(work, today);
  const press = useLongPress(() => onStep(work), () => onStepWithDate(work));
  const position = kind === "issue" && work.readThrough ? `${formatDateShort(work.readThrough)}発売の号まで` : positionLabel(work);
  const latest = latestLabel(work, today);
  return (
    <li className="work-card">
      {work.coverUrl && <img className="cover-thumb card-cover" src={work.coverUrl} alt="" loading="lazy" onClick={() => onOpen(work)} />}
      <button type="button" className="work-main" onClick={() => onOpen(work)}>
        <span className="work-title">
          {work.title}
          {work.seasonLabel && <span className="work-season"> {work.seasonLabel}</span>}
        </span>
        <span className="work-sub">
          <span className="medium-tag">{MEDIUM_LABEL[work.medium]}</span>
          {[position, latest].filter(Boolean).join("・")}
        </span>
        <span className="work-sub dim">最終 {formatDateShort(isoToDateKey(work.touchedAt))}</span>
      </button>
      {unconsumed !== null && unconsumed > 0 && (
        <span className="unconsumed" aria-label={`未消化 ${unconsumed}`}>
          <span className="unconsumed-num">{unconsumed}</span>
          <span className="unconsumed-label">未消化</span>
        </span>
      )}
      {kind !== "none" && work.status !== "done" && (
        <button type="button" className="step-btn" aria-label={`次の${UNIT_LABEL[kind]}を記録（長押しで日付を選ぶ）`} {...press}>
          <Icon name="plus" size={16} />
          <span>1{UNIT_LABEL[kind]}</span>
        </button>
      )}
    </li>
  );
}
