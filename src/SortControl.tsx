// 並び順の切り替え（v0.19.0）。画面とタブの組み合わせごとに、端末の localStorage へ記憶する（作品データ・バックアップには入れない）
import { useCallback, useState } from "react";
import { ChoiceSheet } from "./BottomSheet";
import { Icon } from "./Icon";
import { SORT_LABEL, SORT_OPTIONS, choosePref, dirLabel, flipPref, hasDirection, parseSortPref } from "./sortLogic";
import type { SortKey, SortPref, SortScope } from "./sortLogic";

const storageKey = (scope: SortScope) => `content-shelf:sort:${scope}`;

function loadPref(scope: SortScope): SortPref {
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    return parseSortPref(scope, raw ? JSON.parse(raw) : null);
  } catch {
    return parseSortPref(scope, null);
  }
}

/** その画面の並び順。scope が変わったら（タブを切り替えたら）、そのタブの記憶を読む */
export function useSortPref(scope: SortScope): [SortPref, (pref: SortPref) => void] {
  const [store, setStore] = useState<Partial<Record<SortScope, SortPref>>>({});
  const pref = store[scope] ?? loadPref(scope);
  const set = useCallback(
    (next: SortPref) => {
      setStore((s) => ({ ...s, [scope]: next }));
      try {
        window.localStorage.setItem(storageKey(scope), JSON.stringify(next));
      } catch {
        // 保存できない端末（プライベートモードなど）では、この画面を開いている間だけ効く
      }
    },
    [scope],
  );
  return [pref, set];
}

/** 並び順の選択と向きの切り替え。選択肢が1つの画面は向きのボタンだけ。
 *  選択はブラウザ標準の選択欄ではなく、ほかの選択と同じ下からのシートで選ぶ（v0.21.0） */
export function SortControl({ scope, value, onChange }: { scope: SortScope; value: SortPref; onChange: (pref: SortPref) => void }) {
  const options = SORT_OPTIONS[scope];
  const [open, setOpen] = useState(false);
  return (
    <div className="sort-control">
      {options.length > 1 && (
        <button type="button" className="chip mini sort-pick" aria-label={`並び順：${SORT_LABEL[value.key]}（押すと選ぶ）`} onClick={() => setOpen(true)}>
          {SORT_LABEL[value.key]}
          <Icon name="chevron-down" size={14} />
        </button>
      )}
      {open && (
        <ChoiceSheet<SortKey>
          title="並び順"
          options={options.map((k) => ({ value: k, label: SORT_LABEL[k] }))}
          value={value.key}
          onSelect={(k) => onChange(choosePref(k))}
          onClose={() => setOpen(false)}
        />
      )}
      {hasDirection(value.key) && (
        <button type="button" className="chip mini sort-dir" aria-label={`並びの向き：${dirLabel(value.key, value.dir)}（押すと逆にする）`} onClick={() => onChange(flipPref(value))}>
          {dirLabel(value.key, value.dir)}
        </button>
      )}
    </div>
  );
}
