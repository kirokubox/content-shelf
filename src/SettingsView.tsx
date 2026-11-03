import { useRef, useState } from "react";
import { parseBackup, planMerge, planUpdate } from "./backup";
import { assemblePhotos, buildBackupFile, readBackupFile } from "./photoBackup";
import { getAllPhotoIds, getAllPhotos, putPhotos, replacePhotos } from "./storage";
import { forgetPhotoUrls } from "./useCover";
import { withThumbs } from "./photos";
import type { MergePlan, UpdatePlan } from "./backup";
import { ConfirmSheet } from "./BottomSheet";
import { APP_VERSION } from "./constants";
import { nowIso } from "./dateUtils";
import { exportRange, logInRange } from "./exportRange";
import type { ExportUnit } from "./exportRange";
import { downloadBlob, downloadTextFile } from "./fileUtils";
import { Icon } from "./Icon";
import { parseMangaShelfBackup } from "./mangaShelfImport";
import { buildMarkdown } from "./markdownExport";
import { Screen } from "./Screen";
import type { DataSet, StoredPhoto } from "./types";

type Pending =
  | { kind: "restore"; data: DataSet; works: number; logs: number; photos: StoredPhoto[] }
  | { kind: "merge"; plan: MergePlan; label: string; photos: StoredPhoto[] }
  | { kind: "update"; plan: UpdatePlan; photos: StoredPhoto[] };

/** 確認の文に足す写真の行 */
function photoLine(photos: StoredPhoto[], missing: number): string {
  if (photos.length === 0 && missing === 0) return "";
  return `\n写真：${photos.length}枚${missing > 0 ? `（${missing}枚はファイルの中に見つかりませんでした）` : ""}`;
}

const EXPORT_UNITS: { id: ExportUnit; label: string }[] = [
  { id: "week", label: "週" },
  { id: "month", label: "月" },
  { id: "all", label: "全部" },
];

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
  const [mode, setMode] = useState<"restore" | "merge" | "manga" | "update">("merge");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportUnit, setExportUnit] = useState<ExportUnit>("week");
  const [exportOffset, setExportOffset] = useState(0);

  const range = exportUnit === "all" ? null : exportRange(exportUnit, today, exportOffset);
  const rangeLogCount = range ? data.logs.filter((l) => l.deletedAt === null && logInRange(l.date, l.datePrecision, range)).length : 0;
  const unitWord = exportUnit === "week" ? "週" : "月";
  const offsetWord = exportOffset === 0 ? `今${unitWord}` : exportOffset === -1 ? `先${unitWord}` : `${-exportOffset}${exportUnit === "week" ? "週" : "か月"}前`;

  const exportText = () => {
    if (!range) {
      downloadTextFile(`content-shelf-all-${today}.md`, buildMarkdown(data, nowIso()), "text/markdown");
      showToast("全記録を書き出しました");
      return;
    }
    downloadTextFile(`content-shelf-${exportUnit}-${range.key}.md`, buildMarkdown(data, nowIso(), range), "text/markdown");
    showToast(`${range.label}の記録を書き出しました`);
  };

  const pick = (m: typeof mode) => {
    setMode(m);
    setError("");
    fileRef.current?.click();
  };

  const [missingPhotos, setMissingPhotos] = useState(0);

  const saveBackup = async () => {
    setBusy(true);
    setError("");
    try {
      const f = await buildBackupFile(data, await getAllPhotos(), nowIso(), today);
      downloadBlob(f.fileName, f.blob);
      showToast(f.photoCount > 0 ? `写真${f.photoCount}枚つきで保存しました（ZIP）` : "バックアップを保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "バックアップを保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (mode === "manga") {
      const r = parseMangaShelfBackup(await file.text(), nowIso());
      if (!r.ok) return setError(r.error);
      setPending({ kind: "merge", plan: planMerge(data, { franchises: [], works: r.works, logs: [], people: [] }), label: "マンガ棚から取り込む", photos: [] });
      return;
    }
    let text: string;
    let blobs: Map<string, Blob>;
    try {
      ({ text, blobs } = await readBackupFile(file));
    } catch (e) {
      return setError(e instanceof Error ? e.message : "ファイルを読めませんでした");
    }
    const r = parseBackup(text);
    if (!r.ok) return setError(r.error);
    const { photos, missing } = assemblePhotos(text, blobs);
    setMissingPhotos(missing);
    if (mode === "update") return setPending({ kind: "update", plan: planUpdate(data, r.data), photos });
    if (mode === "restore") setPending({ kind: "restore", data: r.data, works: r.data.works.length, logs: r.data.logs.length, photos });
    else setPending({ kind: "merge", plan: planMerge(data, r.data), label: "バックアップから追加", photos });
  };

  /** 追加・更新：まだ無い写真だけ入れる（写真は差し替えると新しい id になるので、同じ id は同じ写真） */
  const addNewPhotos = async (photos: StoredPhoto[]) => {
    if (photos.length === 0) return;
    const have = new Set(await getAllPhotoIds());
    await putPhotos(await withThumbs(photos.filter((p) => !have.has(p.id))));
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "restore") {
        await replacePhotos(await withThumbs(pending.photos));
        forgetPhotoUrls();
        await onReplace(pending.data);
        showToast("バックアップから戻しました");
      } else if (pending.kind === "update") {
        await addNewPhotos(pending.photos);
        await onAdd(pending.plan.changes);
        const w = pending.plan.counts[0];
        showToast(`作品：追加${w.added}・更新${w.updated}`);
      } else {
        await addNewPhotos(pending.photos);
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
          データはこの端末のブラウザの中だけにあります（いま {works}作品・{logs}件の記録）。ときどき保存しておくと安心です。自分で撮った表紙の写真があるときは、写真ごとZIPで保存します。
        </p>
        <div className="setting-list">
          <button type="button" className="setting-row" disabled={busy} onClick={() => void saveBackup()}>
            <span className="setting-label">バックアップを保存</span>
            <Icon name="download" size={20} />
          </button>
          <button type="button" className="setting-row" onClick={() => pick("merge")}>
            <span className="setting-label">バックアップから追加</span>
            <Icon name="upload" size={20} />
          </button>
          <button type="button" className="setting-row" onClick={() => pick("update")}>
            <span className="setting-label">バックアップから更新（新しくなったものだけ上書き）</span>
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
        <p className="muted small">好きなもの台帳やAIとの振り返りに渡すためのテキストです。週は月曜〜日曜です。</p>
        <div className="segmented export-unit" role="tablist" aria-label="書き出す範囲">
          {EXPORT_UNITS.map((u) => (
            <button key={u.id} type="button" role="tab" aria-selected={u.id === exportUnit} className={`seg${u.id === exportUnit ? " on" : ""}`} onClick={() => { setExportUnit(u.id); setExportOffset(0); }}>
              {u.label}
            </button>
          ))}
        </div>
        {range && (
          <div className="export-period">
            <button type="button" className="icon-btn" aria-label={exportUnit === "week" ? "前の週" : "前の月"} onClick={() => setExportOffset(exportOffset - 1)}>
              <Icon name="chevron-left" size={20} />
            </button>
            <span className="export-period-label">
              <span>{range.title}</span>
              <span className="muted small">{[range.dates, offsetWord, `記録 ${rangeLogCount}件`].filter(Boolean).join("・")}</span>
            </span>
            <button type="button" className="icon-btn" aria-label={exportUnit === "week" ? "次の週" : "次の月"} disabled={exportOffset >= 0} onClick={() => setExportOffset(exportOffset + 1)}>
              <Icon name="chevron-right" size={20} />
            </button>
          </div>
        )}
        <div className="setting-list">
          <button type="button" className="setting-row" onClick={exportText}>
            <span className="setting-label">{range ? "この期間をテキストで書き出す" : "全記録をテキストで書き出す"}</span>
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
      <input ref={fileRef} type="file" accept={mode === "manga" ? "application/json,.json" : "application/json,.json,application/zip,.zip"} hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {pending?.kind === "restore" && (
        <ConfirmSheet
          title="バックアップから戻す"
          message={`いまのデータ（${works}作品・${logs}件の記録）を消して、バックアップの${pending.works}作品・${pending.logs}件の記録に入れ替えます。先にいまのバックアップを保存しておくと安心です。${photoLine(pending.photos, missingPhotos)}`}
          confirmLabel="入れ替える"
          danger
          busy={busy}
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "update" && (
        <ConfirmSheet
          title="バックアップから更新"
          message={pending.plan.counts
            .map((c) => `${c.label}：追加${c.added}・更新${c.updated}（この端末の方が新しい・同じ ${c.kept}件はそのまま）`)
            .join("\n") + photoLine(pending.photos, missingPhotos)}
          confirmLabel="更新する"
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
            .join("\n") + photoLine(pending.photos, missingPhotos) || "追加するものはありません"}
          confirmLabel="追加する"
          busy={busy}
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      )}
    </Screen>
  );
}
