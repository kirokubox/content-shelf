import { useRef, useState } from "react";
import { buildBackup, backupFileName, parseBackup, planMerge } from "./backup";
import type { MergePlan } from "./backup";
import { ConfirmSheet } from "./BottomSheet";
import { APP_VERSION } from "./constants";
import { nowIso } from "./dateUtils";
import { downloadTextFile } from "./fileUtils";
import { Icon } from "./Icon";
import { parseMangaShelfBackup } from "./mangaShelfImport";
import { buildMarkdown } from "./markdownExport";
import { Screen } from "./Screen";
import type { DataSet } from "./types";

type Pending =
  | { kind: "restore"; data: DataSet; works: number; logs: number }
  | { kind: "merge"; plan: MergePlan; label: string };

interface Props {
  data: DataSet;
  today: string;
  persisted: boolean | null;
  onBack: () => void;
  onReplace: (data: DataSet) => Promise<void>;
  onAdd: (changes: DataSet) => Promise<void>;
  showToast: (text: string) => void;
  onRefreshExternal: () => Promise<void>;
}

export function SettingsView({ data, today, persisted, onBack, onReplace, onAdd, showToast, onRefreshExternal }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"restore" | "merge" | "manga">("merge");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = (m: typeof mode) => {
    setMode(m);
    setError("");
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    if (fileRef.current) fileRef.current.value = "";
    if (mode === "manga") {
      const r = parseMangaShelfBackup(text, nowIso());
      if (!r.ok) return setError(r.error);
      setPending({ kind: "merge", plan: planMerge(data, { franchises: [], works: r.works, logs: [], people: [] }), label: "マンガ棚から取り込む" });
      return;
    }
    const r = parseBackup(text);
    if (!r.ok) return setError(r.error);
    if (mode === "restore") setPending({ kind: "restore", data: r.data, works: r.data.works.length, logs: r.data.logs.length });
    else setPending({ kind: "merge", plan: planMerge(data, r.data), label: "バックアップから追加" });
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "restore") {
        await onReplace(pending.data);
        showToast("バックアップから戻しました");
      } else {
        await onAdd(pending.plan.add);
        showToast(`${pending.plan.add.works.length}作品・${pending.plan.add.logs.length}件の記録を追加しました`);
      }
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const works = data.works.filter((w) => w.deletedAt === null).length;
  const logs = data.logs.filter((l) => l.deletedAt === null).length;

  return (
    <Screen title="設定" onBack={onBack}>
      <section className="card">
        <h2>バックアップ</h2>
        <p className="muted small">
          データはこの端末のブラウザの中だけにあります（いま {works}作品・{logs}件の記録）。ときどき保存しておくと安心です。
        </p>
        <div className="setting-list">
          <button type="button" className="setting-row" onClick={() => { downloadTextFile(backupFileName(today), JSON.stringify(buildBackup(data, nowIso()), null, 2)); showToast("バックアップを保存しました"); }}>
            <span className="setting-label">バックアップを保存</span>
            <Icon name="download" size={20} />
          </button>
          <button type="button" className="setting-row" onClick={() => pick("merge")}>
            <span className="setting-label">バックアップから追加</span>
            <Icon name="upload" size={20} />
          </button>
          <button type="button" className="setting-row" onClick={() => pick("restore")}>
            <span className="setting-label">バックアップから戻す（いまのデータと入れ替え）</span>
            <Icon name="upload" size={20} />
          </button>
        </div>
      </section>
      <section className="card">
        <h2>テキストで書き出す</h2>
        <p className="muted small">好きなもの台帳やAIとの振り返りに渡すためのテキストです。</p>
        <div className="setting-list">
          <button type="button" className="setting-row" onClick={() => { downloadTextFile(`content-shelf-all-${today}.md`, buildMarkdown(data, nowIso()), "text/markdown"); showToast("全記録を書き出しました"); }}>
            <span className="setting-label">全記録をテキストで書き出す</span>
            <Icon name="download" size={20} />
          </button>
          <button type="button" className="setting-row" onClick={() => { const from = `${today.slice(0, 7)}-01`; downloadTextFile(`content-shelf-month-${today.slice(0, 7)}.md`, buildMarkdown(data, nowIso(), { from, to: `${today.slice(0, 7)}-31` }), "text/markdown"); showToast("今月の記録を書き出しました"); }}>
            <span className="setting-label">今月の記録をテキストで書き出す</span>
            <Icon name="download" size={20} />
          </button>
        </div>
      </section>
      <section className="card">
        <h2>作品の情報</h2>
        <p className="muted small">AniListとつながったアニメ・マンガの表紙・全話数・完結・放送済みの話数は、アプリを開いたときに12時間ごとに確かめます。見た位置は変えません。</p>
        <div className="setting-list">
          <button
            type="button"
            className="setting-row"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRefreshExternal();
              } catch (e) {
                setError(e instanceof Error ? e.message : "確かめられませんでした");
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="setting-label">いま確かめる</span>
          </button>
        </div>
      </section>
      <section className="card">
        <h2>ほかのアプリから</h2>
        <div className="setting-list">
          <button type="button" className="setting-row" onClick={() => pick("manga")}>
            <span className="setting-label">マンガ棚のバックアップから取り込む</span>
            <Icon name="upload" size={20} />
          </button>
        </div>
        <p className="muted small">同じ作品は二度入りません。マンガ棚には読んだ日が無いので、記録は作らず「何巻まで読んだか」だけを移します。</p>
      </section>
      {error && <p className="notice danger">{error}</p>}
      <section className="card">
        <h2>このアプリについて</h2>
        <dl className="rows">
          <div className="row">
            <dt>バージョン</dt>
            <dd>{APP_VERSION}</dd>
          </div>
          <div className="row">
            <dt>データの保護</dt>
            <dd>{persisted === true ? "自動で消されにくい設定です" : persisted === false ? "ブラウザの判断で消されることがあります" : "確認できません"}</dd>
          </div>
        </dl>
      </section>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {pending?.kind === "restore" && (
        <ConfirmSheet
          title="バックアップから戻す"
          message={`いまのデータ（${works}作品・${logs}件の記録）を消して、バックアップの${pending.works}作品・${pending.logs}件の記録に入れ替えます。先にいまのバックアップを保存しておくと安心です。`}
          confirmLabel="入れ替える"
          danger
          busy={busy}
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "merge" && (
        <ConfirmSheet
          title={pending.label}
          message={pending.plan.counts
            .filter((c) => c.incoming > 0)
            .map((c) => `${c.label}：${c.incoming}件のうち、新しく${c.added}件を追加（すでにある${c.skipped}件はそのまま）`)
            .join("\n") || "追加するものはありません"}
          confirmLabel="追加する"
          busy={busy}
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      )}
    </Screen>
  );
}
