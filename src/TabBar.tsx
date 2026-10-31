import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export type TabId = "home" | "continue" | "records" | "summary";

export const TABS: ReadonlyArray<{ id: TabId; label: string; icon: IconName }> = [
  { id: "home", label: "ホーム", icon: "home" },
  { id: "continue", label: "続き", icon: "play" },
  { id: "records", label: "記録", icon: "book-open" },
  { id: "summary", label: "集計", icon: "bar-chart" },
];

export function TabBar({ current, onSelect }: { current: TabId; onSelect: (id: TabId) => void }) {
  return (
    <nav className="tabbar" aria-label="画面の切り替え">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab${tab.id === current ? " active" : ""}`}
          aria-current={tab.id === current ? "page" : undefined}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab-icon">
            <Icon name={tab.icon} size={22} />
          </span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
