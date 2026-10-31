import { useCallback, useEffect, useState } from "react";
import { ConfirmSheet } from "./BottomSheet";
import { MEDIUM_LABEL } from "./constants";
import { applyChanges, EMPTY_DATA } from "./dataOps";
import { nowIso, todayKey } from "./dateUtils";
import { Icon } from "./Icon";
import { LogSheet } from "./LogSheet";
import { progressKindOf, stepForward, withAutoStatus } from "./progressLogic";
import { FranchiseView, PersonView } from "./RelationViews";
import { SearchView } from "./SearchView";
import { SettingsView } from "./SettingsView";
import { loadAll, putRecords, replaceAll, requestPersist } from "./storage";
import { TabBar, TABS } from "./TabBar";
import type { TabId } from "./TabBar";
import { ContinueView, HomeView, RecordsView, SummaryView } from "./TabViews";
import { useToast } from "./Toast";
import type { DataSet, Log, Medium, Work, WorkStatus } from "./types";
import { MEDIA } from "./types";
import { WorkDetail } from "./WorkDetail";
import { WorkEditor } from "./WorkEditor";
import { newLog } from "./workFactory";

type Overlay =
  | { kind: "search" }
  | { kind: "settings" }
  | { kind: "detail"; workId: string }
  | { kind: "editor"; workId: string | null; medium: Medium }
  | { kind: "pickMedium" }
  | { kind: "franchise"; id: string }
  | { kind: "person"; id: string };

type SheetState = { workId: string; log: Log | null; newKind: Log["kind"] } | null;

export default function App() {
  const [data, setData] = useState<DataSet>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<TabId>("home");
  const [stack, setStack] = useState<Overlay[]>([]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [confirmDelete, setConfirmDelete] = useState<Work | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [toast, showToast] = useToast();
  const today = todayKey();

  useEffect(() => {
    loadAll()
      .then((d) => {
        setData(d);
        setLoaded(true);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "データを読み込めませんでした"));
    requestPersist().then(setPersisted);
  }, []);

  /** 変更を画面と保存先の両方へ */
  const commit = useCallback(
    async (changes: Partial<DataSet>) => {
      setData((cur) => applyChanges(cur, changes));
      try {
        await putRecords(changes);
      } catch (e) {
        showToast(`保存できませんでした：${e instanceof Error ? e.message : ""}`, 5000);
      }
    },
    [showToast],
  );

  const push = (o: Overlay) => setStack((s) => [...s, o]);
  const pop = () => setStack((s) => s.slice(0, -1));
  const top = stack[stack.length - 1] ?? null;
  const workById = (id: string) => data.works.find((w) => w.id === id) ?? null;

  const step = (work: Work, date: string = today) => {
    const r = stepForward(work, date, today);
    if ("error" in r) return showToast(r.error);
    const log = newLog(r.log);
    commit({ works: [r.work], logs: [log] });
    const kind = progressKindOf(work);
    const what = kind === "issue" ? "1号読んだ" : kind === "episode" ? `第${r.log.position}話を見た` : `${r.log.position}巻を読んだ`;
    const doneText = r.work.status === "done" && work.status !== "done" ? "。最後まで見たので記録へ移しました" : "";
    showToast(`${work.title}：${what}${doneText}`, 4000, {
      label: "取り消す",
      onClick: () => commit({ works: [{ ...work, updatedAt: nowIso() }], logs: [{ ...log, deletedAt: nowIso() }] }),
    });
  };

  const saveLog = (work: Work, log: Log, isNew: boolean) => {
    const kind = progressKindOf(work);
    if (isNew && log.kind === "progress" && kind === "issue") {
      // 週刊誌の長押し：選んだ日で次の号を読んだことにする
      const r = stepForward(work, log.date, today);
      if ("error" in r) return showToast(r.error);
      commit({ works: [r.work], logs: [{ ...log, issueDate: r.log.issueDate }] });
    } else if (log.kind === "progress" && log.position !== null && (kind === "episode" || kind === "volume") && log.position > (work.progress ?? 0)) {
      const now = nowIso();
      const updated = withAutoStatus({ ...work, progress: log.position, status: work.status === "wish" || work.status === "paused" ? "active" : work.status, touchedAt: now, updatedAt: now }, now);
      commit({ works: [updated], logs: [log] });
    } else {
      const now = nowIso();
      commit({ works: [{ ...work, touchedAt: now }], logs: [log] });
    }
    setSheet(null);
    showToast(isNew ? "記録しました" : "記録を直しました");
  };

  const setStatus = (work: Work, status: WorkStatus) => {
    const now = nowIso();
    commit({ works: [{ ...work, status, completedAt: status === "done" ? work.completedAt ?? now : null, touchedAt: now, updatedAt: now }] });
    showToast(status === "done" ? "記録へ移しました" : status === "paused" ? "休止にしました" : status === "wish" ? "見たい・読みたいにしました" : "続きに戻しました");
  };

  const deleteWork = (work: Work) => {
    const now = nowIso();
    const logs = data.logs.filter((l) => l.workId === work.id && l.deletedAt === null).map((l) => ({ ...l, deletedAt: now }));
    commit({ works: [{ ...work, deletedAt: now, updatedAt: now }], logs });
    setConfirmDelete(null);
    setStack((s) => s.filter((o) => !(o.kind === "detail" && o.workId === work.id)));
    showToast("作品を削除しました", 5000, { label: "取り消す", onClick: () => commit({ works: [work], logs: logs.map((l) => ({ ...l, deletedAt: null })) }) });
  };

  const handlers = {
    today,
    onOpen: (w: Work) => push({ kind: "detail", workId: w.id }),
    onStep: (w: Work) => step(w),
    onStepWithDate: (w: Work) => setSheet({ workId: w.id, log: null, newKind: "progress" }),
  };

  const defaultMedium: Medium = "anime";
  const openAdd = () => push({ kind: "pickMedium" });

  if (loadError) {
    return (
      <div className="app">
        <div className="content">
          <p className="notice danger">{loadError}</p>
        </div>
      </div>
    );
  }

  const sheetWork = sheet ? workById(sheet.workId) : null;
  const title = TABS.find((t) => t.id === tab)!.label;

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="topbar-title">{tab === "home" ? "コンテンツ棚" : title}</h1>
        <button type="button" className="icon-btn" aria-label="検索" onClick={() => push({ kind: "search" })}>
          <Icon name="search" size={22} />
        </button>
        <button type="button" className="icon-btn" aria-label="設定" onClick={() => push({ kind: "settings" })}>
          <Icon name="settings" size={22} />
        </button>
      </header>
      <main className="content" key={tab}>
        {!loaded ? null : tab === "home" ? (
          <HomeView data={data} handlers={handlers} onAdd={openAdd} onGoContinue={() => setTab("continue")} onGoRecords={() => setTab("records")} />
        ) : tab === "continue" ? (
          <ContinueView data={data} handlers={handlers} onAdd={openAdd} />
        ) : tab === "records" ? (
          <RecordsView data={data} onOpen={handlers.onOpen} />
        ) : (
          <SummaryView data={data} today={today} />
        )}
      </main>
      <button type="button" className="fab" aria-label="作品を登録" onClick={openAdd}>
        <Icon name="plus" size={26} />
      </button>
      <TabBar current={tab} onSelect={(id) => { setTab(id); setStack([]); }} />

      {stack.map((o, i) => {
        const key = `${o.kind}-${i}`;
        if (o.kind === "search") return <SearchView key={key} data={data} onBack={pop} onOpen={handlers.onOpen} onOpenPerson={(p) => push({ kind: "person", id: p.id })} onOpenFranchise={(f) => push({ kind: "franchise", id: f.id })} />;
        if (o.kind === "franchise") {
          const f = data.franchises.find((x) => x.id === o.id && x.deletedAt === null);
          if (!f) return null;
          return (
            <FranchiseView
              key={key}
              data={data}
              franchise={f}
              onBack={pop}
              onOpen={handlers.onOpen}
              onRename={(title) => commit({ franchises: [{ ...f, title, updatedAt: nowIso() }] })}
              onDelete={() => {
                const now = nowIso();
                const works = data.works.filter((w) => w.franchiseId === f.id).map((w) => ({ ...w, franchiseId: null, updatedAt: now }));
                commit({ franchises: [{ ...f, deletedAt: now, updatedAt: now }], works });
                pop();
                showToast("親作品を消しました（作品は残っています）");
              }}
            />
          );
        }
        if (o.kind === "person") {
          const p = data.people.find((x) => x.id === o.id && x.deletedAt === null);
          if (!p) return null;
          return (
            <PersonView
              key={key}
              data={data}
              person={p}
              onBack={pop}
              onOpen={handlers.onOpen}
              onRename={(name) => commit({ people: [{ ...p, name, updatedAt: nowIso() }] })}
              onDelete={() => {
                const now = nowIso();
                const works = data.works.filter((w) => w.personIds.includes(p.id)).map((w) => ({ ...w, personIds: w.personIds.filter((x) => x !== p.id), updatedAt: now }));
                commit({ people: [{ ...p, deletedAt: now, updatedAt: now }], works });
                pop();
                showToast("人物を消しました（作品は残っています）");
              }}
            />
          );
        }
        if (o.kind === "settings")
          return (
            <SettingsView
              key={key}
              data={data}
              today={today}
              persisted={persisted}
              onBack={pop}
              onReplace={async (d) => {
                await replaceAll(d);
                setData(d);
              }}
              onAdd={async (d) => {
                await putRecords(d);
                setData((cur) => applyChanges(cur, d));
              }}
              showToast={showToast}
            />
          );
        if (o.kind === "pickMedium")
          return (
            <div key={key} className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && pop()}>
              <div className="sheet" role="dialog" aria-label="何を登録しますか">
                <div className="sheet-head">
                  <h2>何を登録しますか</h2>
                </div>
                <div className="medium-grid">
                  {MEDIA.map((m) => (
                    <button key={m} type="button" className="medium-btn" onClick={() => setStack((s) => [...s.slice(0, -1), { kind: "editor", workId: null, medium: m }])}>
                      {MEDIUM_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        if (o.kind === "editor") {
          const w = o.workId ? workById(o.workId) : null;
          return (
            <WorkEditor
              key={key}
              work={w}
              initialMedium={o.medium ?? defaultMedium}
              today={today}
              data={data}
              onCancel={pop}
              onSave={(work, firstLog, created) => {
                commit({ works: [work], logs: firstLog ? [firstLog] : [], franchises: created.franchises, people: created.people });
                pop();
                showToast(w ? "保存しました" : `${work.title}を登録しました`);
              }}
            />
          );
        }
        const w = workById(o.workId);
        if (!w || w.deletedAt !== null) return null;
        return (
          <WorkDetail
            key={key}
            work={w}
            logs={data.logs.filter((l) => l.workId === w.id && l.deletedAt === null)}
            franchise={w.franchiseId ? data.franchises.find((f) => f.id === w.franchiseId && f.deletedAt === null) ?? null : null}
            people={w.personIds.map((id) => data.people.find((p) => p.id === id && p.deletedAt === null)).filter((p): p is NonNullable<typeof p> => !!p)}
            onOpenFranchise={(f) => push({ kind: "franchise", id: f.id })}
            onOpenPerson={(p) => push({ kind: "person", id: p.id })}
            today={today}
            onBack={pop}
            onEdit={() => push({ kind: "editor", workId: w.id, medium: w.medium })}
            onStep={(x) => step(x)}
            onAddLog={(kind) => setSheet({ workId: w.id, log: null, newKind: kind })}
            onEditLog={(log) => setSheet({ workId: w.id, log, newKind: log.kind })}
            onSetStatus={(s) => setStatus(w, s)}
            onDelete={() => setConfirmDelete(w)}
          />
        );
      })}

      {sheet && sheetWork && (
        <LogSheet
          work={sheetWork}
          log={sheet.log}
          today={today}
          newKind={sheet.newKind}
          onClose={() => setSheet(null)}
          onSave={(log) => saveLog(sheetWork, log, sheet.log === null)}
          onDelete={(log) => {
            commit({ logs: [{ ...log, deletedAt: nowIso() }] });
            setSheet(null);
            showToast("記録を削除しました", 5000, { label: "取り消す", onClick: () => commit({ logs: [log] }) });
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmSheet
          title="作品を削除"
          message={`「${confirmDelete.title}」と、その記録をすべて削除します。`}
          confirmLabel="削除する"
          danger
          onConfirm={() => deleteWork(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
      {toast}
    </div>
  );
}
