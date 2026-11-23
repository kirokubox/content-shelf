import { useEffect, useRef, useState } from "react";
import { describeMigration, describeMigrationV3 } from "./migrate";
import type { MigrationReport, MigrationV3Report } from "./migrate";
import { parseBackup, planMerge, planUpdate } from "./backup";
import { assemblePhotos, buildBackupFile, readBackupFile } from "./photoBackup";
import { getAllPhotoIds, getAllPhotos, getMigrationBackup, getMigrationReport, getMigrationV2Backup, getMigrationV3Report, putPhotos, replacePhotos } from "./storage";
import { forgetPhotoUrls } from "./useCover";
import { withThumbs } from "./photos";
import type { MergePlan, UpdatePlan } from "./backup";
import { ConfirmSheet } from "./BottomSheet";
import { APP_VERSION, MEDIUM_LABEL } from "./constants";
import { nowIso } from "./dateUtils";
import { exportRange, logInRange } from "./exportRange";
import type { ExportUnit } from "./exportRange";
import { downloadBlob, downloadTextFile } from "./fileUtils";
import { Icon } from "./Icon";
import { parseMangaShelfBackup } from "./mangaShelfImport";
import { buildMarkdown } from "./markdownExport";
import { Screen } from "./Screen";
import { visibleMedia } from "./mediaPrefs";
import { MEDIA } from "./types";
import type { DataSet, Medium, StoredPhoto } from "./types";

type Pending =
  | { kind: "restore"; data: DataSet; works: number; logs: number; photos: StoredPhoto[]; migration: MigrationReport | null; migrationV3?: MigrationV3Report | null }
  | { kind: "merge"; plan: MergePlan; label: string; photos: StoredPhoto[]; migration: MigrationReport | null; migrationV3?: MigrationV3Report | null }
  | { kind: "update"; plan: UpdatePlan; photos: StoredPhoto[]; migration: MigrationReport | null; migrationV3?: MigrationV3Report | null };

/** 確認の文に足す、版1のバックアップを新しい形へ移し替えた結果の行 */
function migrationLine(m: MigrationReport | null, m3?: MigrationV3Report | null): string {
  if (m) return "\n\n古い形のバックアップなので、新しい形へ移し替えてから取り込みます。\n" + describeMigration(m).join("\n");
  if (m3) return "\n\n古い形（v0.16）のバックアップなので、持っている形・読む手段を新しい形へ移し替えてから取り込みます。\n" + describeMigrationV3(m3).join("\n");
  return "";
}

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
  enabledMedia: Medium[] | null;
  onToggleMedium: (medium: Medium) => void;
  onBack: () => void;
  onReplace: (data: DataSet) => Promise<void>;
  onAdd: (changes: DataSet) => Promise<void>;
  showToast: (text: string) => void;
  onRefreshExternal: () => Promise<void>;
  /** マンガの作者と完結した日を AniList から入れる（v1.0.0） */
  onFetchMangaInfo: () => Promise<void>;
}

export function SettingsView({ data, today, persisted, enabledMedia, onToggleMedium, onBack, onReplace, onAdd, showToast, onRefreshExternal, onFetchMangaInfo }: Props) {
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
      setPending({ kind: "merge", plan: planMerge(data, { franchises: [], works: r.works, logs: [], people: [] }), label: "マンガ棚から取り込む", photos: [], migration: null });
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
    if (mode === "update") return setPending({ kind: "update", plan: planUpdate(data, r.data), photos, migration: r.migration, migrationV3: r.migrationV3 });
    if (mode === "restore") setPending({ kind: "restore", data: r.data, works: r.data.works.length, logs: r.data.logs.length, photos, migration: r.migration, migrationV3: r.migrationV3 });
    else setPending({ kind: "merge", plan: planMerge(data, r.data), label: "バックアップから追加", photos, migration: r.migration, migrationV3: r.migrationV3 });
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

  // この端末で版1から版2へ移し替えたときの結果（無ければ出さない）
  const [migReport, setMigReport] = useState<MigrationReport | null>(null);
  const [hasMigBackup, setHasMigBackup] = useState(false);
  // 版2→版3（v0.17.0）
  const [mig3Report, setMig3Report] = useState<MigrationV3Report | null>(null);
  const [hasMig2Backup, setHasMig2Backup] = useState(false);
  useEffect(() => {
    getMigrationV3Report().then((r) => setMig3Report(r ?? null)).catch(() => undefined);
    getMigrationV2Backup().then((b) => setHasMig2Backup(b !== undefined)).catch(() => undefined);
    getMigrationReport().then((r) => setMigReport(r ?? null)).catch(() => undefined);
    getMigrationBackup().then((b) => setHasMigBackup(b !== undefined)).catch(() => undefined);
  }, []);
  const exportMigBackup = async () => {
    const b = await getMigrationBackup();
    if (!b) return setError("移し替え前のデータが見つかりませんでした");
    downloadTextFile(`content-shelf-before-migration-${today}.json`, JSON.stringify({ app: "content-shelf", version: 1, exportedAt: b.savedAt, ...b.data }, null, 2), "application/json");
    showToast("移し替え前のデータを書き出しました");
  };
  const exportMig2Backup = async () => {
    const b = await getMigrationV2Backup();
    if (!b) return setError("移し替え前のデータが見つかりませんでした");
    downloadTextFile(`content-shelf-before-migration-v2-${today}.json`, JSON.stringify({ app: "content-shelf", version: 2, exportedAt: b.savedAt, ...b.data }, null, 2), "application/json");
    showToast("v0.16の形のデータを書き出しました");
  };

  const works = data.works.filter((w) => w.deletedAt === null).length;
  const logs = data.logs.filter((l) => l.deletedAt === null).length;

  return (
    <Screen title="設定" onBack={onBack}>
      <section className="card">
        <h2>バックアップ</h2>
        <p className="muted small">
          データはこの端末のブラウザの中だけにあります（いま {works}作品・{logs}件の記録）。ときどき保存しておくと安心です。表紙や記録の写真があるときは、写真ごとZIPで保存します。文字だけのバックアップには写真の本体は入りません。
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
      {(migReport || hasMigBackup || mig3Report || hasMig2Backup) && (
        <section className="card">
          <h2>データの形の移し替え</h2>
          <p className="muted small">データの形を新しくしたとき、端末のデータを自動で移しました。移す前のデータは、この端末の中にそのまま残してあります。</p>
          {mig3Report && (
            <>
              <p className="small"><strong>v0.17.0（持っている形・読む手段を2段に）</strong></p>
              <pre className="migration-text">{describeMigrationV3(mig3Report).join("\n")}</pre>
            </>
          )}
          {hasMig2Backup && (
            <div className="setting-list">
              <button type="button" className="setting-row" onClick={() => void exportMig2Backup()}>
                <span className="setting-label">v0.16の形のデータを書き出す（JSON）</span>
                <Icon name="download" size={20} />
              </button>
            </div>
          )}
          {migReport && <p className="small"><strong>v0.16.0（作品の状態・クール・購入）</strong></p>}
          {migReport && <pre className="migration-text">{describeMigration(migReport).join("\n")}</pre>}
          {hasMigBackup && (
            <div className="setting-list">
              <button type="button" className="setting-row" onClick={() => void exportMigBackup()}>
                <span className="setting-label">移し替え前のデータを書き出す（JSON）</span>
                <Icon name="download" size={20} />
              </button>
            </div>
          )}
        </section>
      )}
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
          <button
            type="button"
            className="setting-row"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onFetchMangaInfo();
              } catch (e) {
                setError(e instanceof Error ? e.message : "取ってこられませんでした");
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="setting-label">マンガの作者と完結した日を入れる</span>
          </button>
        </div>
        <p className="muted small">作者が空のマンガと、完結しているのに完結した日が無いマンガだけ、AniListから入れます（並び順「作者」「完結・発売日」に使います）。入っている作者・日付は変えません。</p>
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
        <h2>使う種類</h2>
        <div className="chips">
          {MEDIA.map((m) => {
            const on = visibleMedia(enabledMedia).includes(m);
            return (
              <button key={m} type="button" className={`chip mini${on ? " on" : ""}`} aria-pressed={on} onClick={() => onToggleMedium(m)}>
                {MEDIUM_LABEL[m]}
              </button>
            );
          })}
        </div>
        <p className="muted small">外した種類は、登録するときと種類で絞り込むときの候補に出なくなります。すでに登録した作品はそのまま残り、「すべて」では表示されます。最後の1つは外せません。この設定はこの端末だけのもので、バックアップには入りません。</p>
      </section>
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
          message={`いまのデータ（${works}作品・${logs}件の記録）を消して、バックアップの${pending.works}作品・${pending.logs}件の記録に入れ替えます。先にいまのバックアップを保存しておくと安心です。${photoLine(pending.photos, missingPhotos)}${migrationLine(pending.migration, pending.migrationV3)}`}
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
            .join("\n") + photoLine(pending.photos, missingPhotos) + migrationLine(pending.migration, pending.migrationV3)}
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
            .join("\n") + photoLine(pending.photos, missingPhotos) + migrationLine(pending.migration, pending.migrationV3) || "追加するものはありません"}
          confirmLabel="追加する"
          busy={busy}
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      )}
    </Screen>
  );
}
