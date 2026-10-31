import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** 全画面で重ねる画面（詳細・入力・検索・設定）。左上に戻る、右上に操作 */
export function Screen({ title, onBack, actions, children }: { title: string; onBack: () => void; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="screen-overlay" role="dialog" aria-label={title}>
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="戻る" onClick={onBack}>
          <Icon name="chevron-left" size={22} />
        </button>
        <h1 className="topbar-title">{title}</h1>
        {actions}
      </header>
      <div className="content">{children}</div>
    </div>
  );
}

/** 右上の「…」メニュー */
export function MoreMenu({ open, onToggle, items }: { open: boolean; onToggle: () => void; items: { label: string; danger?: boolean; onClick: () => void }[] }) {
  return (
    <div className="menu-wrap">
      <button type="button" className="icon-btn" aria-label="そのほかの操作" aria-expanded={open} onClick={onToggle}>
        <Icon name="more" size={22} />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={onToggle} />
          <div className="menu" role="menu">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={it.danger ? "danger" : undefined}
                onClick={() => {
                  onToggle();
                  it.onClick();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 星（0〜5。同じ星をもう一度押すと消す） */
export function Stars({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  return (
    <span className="stars" role={onChange ? "radiogroup" : undefined} aria-label={`星${value ?? 0}つ`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" className={`star${(value ?? 0) >= n ? " on" : ""}`} aria-label={`星${n}`} onClick={() => onChange(value === n ? null : n)}>
            <Icon name="star" size={22} />
          </button>
        ) : (
          <span key={n} className={`star${(value ?? 0) >= n ? " on" : ""}`}>
            <Icon name="star" size={14} />
          </span>
        ),
      )}
    </span>
  );
}
