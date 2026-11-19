import { useCallback, useEffect, useState } from "react";
import { applyAnilist, fetchAnilistByIds } from "./anilist";
import type { AnilistMedia } from "./anilist";
import { ConfirmSheet } from "./BottomSheet";
import { MEDIUM_LABEL, PURCHASE_STAGE_LABEL, REFRESH_INTERVAL_MS, hasVia, workStatusWord } from "./constants";
import { defaultVia } from "./courLogic";
import { applyChanges, EMPTY_DATA } from "./dataOps";
import { nowIso, todayKey } from "./dateUtils";
import { Icon } from "./Icon";
import { LogDetail } from "./LogDetail";
import { LogSheet } from "./LogSheet";
import { ENABLED_MEDIA_KEY, parseEnabledMedia, toggleMedium, visibleMedia } from "./mediaPrefs";
import { addCurrentRerun, markNewVolume, progressKindOf, startAgain, stepForward, withAutoStatus } from "./progressLogic";
import { buyVolumes, reserveVolumes, setPurchaseStage, volumesText } from "./purchaseLogic";
import type { Shape } from "./purchaseLogic";
import { PurchaseView, VolumePickSheet } from "./PurchaseView";
import { FranchiseView, PersonView } from "./RelationViews";
import { SearchView } from "./SearchView";
import { SettingsView } from "./SettingsView";
import { loadAll, putRecords, replaceAll, requestPersist } from "./storage";
import { TabBar, TABS } from "./TabBar";
import type { TabId } from "./TabBar";
import { ContinueView, CourView, HomeView, RecordsView, SummaryView } from "./TabViews";
import { useToast } from "./Toast";
import type { DataSet, Log, Medium, Work, WorkStatus } from "./types";
import { WorkDetail } from "./WorkDetail";
import { WorkEditor } from "./WorkEditor";
import { newLog } from "./workFactory";

type Overlay =
  | { kind: "search" }
  | { kind: "settings" }
  | { kind: "cour" }
  | { kind: "detail"; workId: string }
  | { kind: "log"; workId: string; logId: string }
  | { kind: "editor"; workId: string | null; medium: Medium; pick?: AnilistMedia }
  | { kind: "pickMedium" }
  | { kind: "franchise"; id: string }
  | { kind: "person"; id: string };

type SheetState = { workId: string; log: Log | null; newKind: Log["kind"]; finish?: boolean } | null;

export default function App() {
  const [data, setData] = useState<DataSet>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<TabId>("home");
  const [stack, setStack] = useState<Overlay[]>([]);
  const [sheet, setSheet] = useState<SheetState>(null);
  // マンガの巻を選ぶシート（買った・予約した）
  const [volSheet, setVolSheet] = useState<{ workId: string; mode: "buy" | "reserve" } | null>(null);
  // 使う種類（登録画面に出す種類）。この端末の表示の設定で、バックアップには入れない。null＝全部
  const [enabledMedia, setEnabledMedia] = useState<Medium[] | null>(() => {
    try {
      return parseEnabledMedia(JSON.parse(localStorage.getItem(ENABLED_MEDIA_KEY) ?? "null"));
    } catch {
      return null;
    }
  });
  const toggleEnabledMedium = (medium: Medium) => {
    const next = toggleMedium(enabledMedia, medium);
    setEnabledMedia(next);
    try {
      localStorage.setItem(ENABLED_MEDIA_KEY, JSON.stringify(next));
    } catch {
      // 表示の設定なので、保存できなくても登録は続けられる
    }
  };
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

  /** AniListとつながった作品の表紙・話数・完結を確かめる（見た位置は変えない） */
  const refreshExternal = useCallback(async (works: Work[], force: boolean): Promise<number> => {
    const due = works.filter((w) => w.deletedAt === null && w.externalIds.anilist && w.status !== "done" &&
      (force || !w.infoCheckedAt || Date.now() - Date.parse(w.infoCheckedAt) > REFRESH_INTERVAL_MS));
    if (due.length === 0) return 0;
    const media = await fetchAnilistByIds(Array.from(new Set(due.map((w) => w.externalIds.anilist!))));
    const byId = new Map(media.map((m) => [m.id, m]));
    const now = nowIso();
    const changed = due
      .map((w) => {
        const m = byId.get(w.externalIds.anilist!);
        return m ? withAutoStatus(applyAnilist(w, m, now), now) : null;
      })
      .filter((w): w is Work => w !== null);
    if (changed.length > 0) {
      setData((cur) => applyChanges(cur, { works: changed }));
      await putRecords({ works: changed });
    }
    return changed.length;
  }, []);

  useEffect(() => {
    if (!loaded || !navigator.onLine) return;
    refreshExternal(data.works, false).catch(() => {});
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  /** 変更を画面と保存先の両方へ。保存できたら true（できなければ知らせて false） */
  const commit = useCallback(
    async (changes: Partial<DataSet>): Promise<boolean> => {
      setData((cur) => applyChanges(cur, changes));
      try {
        await putRecords(changes);
        return true;
      } catch (e) {
        showToast(`保存できませんでした：${e instanceof Error ? e.message : ""}`, 5000);
        return false;
      }
    },
    [showToast],
  );

  /**
   * 購入の操作を保存する（v0.17.0）。保存できたら「取り消す」つきで知らせ、できなかったら画面も元に戻す。
   * 購入の操作は見る・読む進み具合を変えない（purchaseLogic の関数がそうなっている）
   */
  const savePurchase = async (prev: Work, next: Work, message: string) => {
    const ok = await commit({ works: [next] });
    if (!ok) {
      setData((cur) => applyChanges(cur, { works: [prev] }));
      return;
    }
    showToast(message, 5000, {
      label: "取り消す",
      onClick: () => {
        void commit({ works: [{ ...prev, updatedAt: nowIso() }] }).then((undone) => { if (undone) showToast("取り消しました"); });
      },
    });
  };
  const pickVolumes = (work: Work, mode: "buy" | "reserve") => setVolSheet({ workId: work.id, mode });
  const confirmVolumes = (work: Work, mode: "buy" | "reserve", nums: number[], shape: Shape) => {
    const r = mode === "buy" ? buyVolumes(work, nums, shape) : reserveVolumes(work, nums, shape);
    if ("error" in r) return showToast(r.error);
    setVolSheet(null);
    void savePurchase(work, r.work, `${work.title}：${volumesText(nums)}巻を${mode === "buy" ? "買った" : "予約した"}にしました`);
  };
  const setStage = (work: Work, stage: "reserved" | "owned") => {
    void savePurchase(work, setPurchaseStage(work, stage), `${work.title}：「${PURCHASE_STAGE_LABEL[stage]}」にしました`);
  };
  /** ホームに出す積読（全体で1冊だけ） */
  const toggleHomePick = (work: Work) => {
    const now = nowIso();
    const on = !work.homePick;
    const others = data.works.filter((w) => w.homePick && w.id !== work.id).map((w) => ({ ...w, homePick: false, updatedAt: now }));
    void commit({ works: [...others, { ...work, homePick: on, updatedAt: now }] }).then((ok) => { if (ok) showToast(on ? "ホームに出す積読にしました" : "ホームに出す積読から外しました"); });
  };

  const push = (o: Overlay) => setStack((s) => [...s, o]);
  const pop = () => setStack((s) => s.slice(0, -1));
  const top = stack[stack.length - 1] ?? null;
  const workById = (id: string) => data.works.find((w) => w.id === id) ?? null;

  const step = (work: Work, date: string = today) => {
    const r = stepForward(work, date, today);
    if ("error" in r) return showToast(r.error);
    const log = newLog({ ...r.log, via: hasVia(work.medium) ? defaultVia(work, data.logs, today) : null });
    commit({ works: [r.work], logs: [log] });
    const kind = progressKindOf(work);
    const what = kind === "issue" ? "1号読んだ" : kind === "episode" ? `第${r.log.position}話を見た` : `${r.log.position}巻を読んだ`;
    const doneText = r.work.status === "done" && work.status !== "done" ? "。最後まで見たので記録へ移しました" : "";
    showToast(`${work.title}：${what}${doneText}`, 4000, {
      label: "取り消す",
      onClick: () => commit({ works: [{ ...work, updatedAt: nowIso() }], logs: [{ ...log, deletedAt: nowIso() }] }),
    });
  };

  const saveLog = (work: Work, log: Log, isNew: boolean, finish = false) => {
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
    } else if (finish && isNew && work.status !== "done") {
      // 読書中の小説の「読み終えた」：記録を保存したら読了にする
      const now = nowIso();
      commit({ works: [{ ...work, status: "done", completedAt: work.completedAt ?? now, touchedAt: now, updatedAt: now }], logs: [log] });
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
    showToast(`「${workStatusWord(work, status)}」にしました`);
  };

  const deleteWork = (work: Work) => {
    const now = nowIso();
    const logs = data.logs.filter((l) => l.workId === work.id && l.deletedAt === null).map((l) => ({ ...l, deletedAt: now }));
    commit({ works: [{ ...work, deletedAt: now, updatedAt: now }], logs });
    setConfirmDelete(null);
    setStack((s) => s.filter((o) => !(o.kind === "detail" && o.workId === work.id)));
    showToast("作品を削除しました", 5000, { label: "取り消す", onClick: () => commit({ works: [work], logs: logs.map((l) => ({ ...l, deletedAt: null })) }) });
  };

  const newVolume = (work: Work) => {
    const next = markNewVolume(work);
    commit({ works: [next] });
    showToast(`${work.title}：新刊（${next.latestKnown}巻）`, 4000, { label: "取り消す", onClick: () => commit({ works: [{ ...work, updatedAt: nowIso() }] }) });
  };

  const handlers = {
    today,
    onOpen: (w: Work) => push({ kind: "detail", workId: w.id }),
    onStep: (w: Work) => step(w),
    onStepWithDate: (w: Work) => setSheet({ workId: w.id, log: null, newKind: "progress" }),
    onFinish: (w: Work) => setSheet({ workId: w.id, log: null, newKind: "view", finish: true }),
  };
  const openRecord = (item: import("./TabViews").RecordItem) => {
    if (item.log) push({ kind: "log", workId: item.work.id, logId: item.log.id });
    else push({ kind: "detail", workId: item.work.id });
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
          <HomeView data={data} handlers={handlers} onAdd={openAdd} onGoContinue={() => setTab("continue")} onGoCour={() => push({ kind: "cour" })} onGoRecords={() => setTab("records")} onOpenRecord={openRecord} enabledMedia={enabledMedia} onToggleMedium={toggleEnabledMedium} />
        ) : tab === "continue" ? (
          <ContinueView data={data} handlers={handlers} onAdd={openAdd} enabledMedia={enabledMedia} />
        ) : tab === "purchase" ? (
          <PurchaseView data={data} today={today} enabledMedia={enabledMedia} handlers={{ onOpen: handlers.onOpen, onPickVolumes: pickVolumes, onSetStage: setStage }} />
        ) : tab === "records" ? (
          <RecordsView data={data} onOpen={openRecord} enabledMedia={enabledMedia} />
        ) : (
          <SummaryView data={data} today={today} onOpen={handlers.onOpen} />
        )}
      </main>
      <button type="button" className="fab" aria-label="作品を登録" onClick={openAdd}>
        <Icon name="plus" size={26} />
      </button>
      <TabBar current={tab} onSelect={(id) => { setTab(id); setStack([]); }} />

      {stack.map((o, i) => {
        const key = `${o.kind}-${i}`;
        if (o.kind === "search")
          return (
            <SearchView
              key={key}
              data={data}
              onBack={pop}
              onOpen={handlers.onOpen}
              onOpenPerson={(p) => push({ kind: "person", id: p.id })}
              onOpenFranchise={(f) => push({ kind: "franchise", id: f.id })}
              onPickExternal={(m) => {
                const existing = data.works.find((w) => w.deletedAt === null && w.externalIds.anilist === m.id);
                if (existing) {
                  showToast("登録済みの作品です");
                  push({ kind: "detail", workId: existing.id });
                } else push({ kind: "editor", workId: null, medium: m.type === "ANIME" ? "anime" : "manga", pick: m });
              }}
            />
          );
        if (o.kind === "cour") return <CourView key={key} data={data} handlers={handlers} onBack={pop} />;
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
              onSetImage={(imageUrl) => { void commit({ people: [{ ...p, imageUrl, updatedAt: nowIso() }] }).then((ok) => { if (ok) showToast(imageUrl ? "画像を入れました" : "画像を外しました"); }); }}
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
              enabledMedia={enabledMedia}
              onToggleMedium={toggleEnabledMedium}
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
              onRefreshExternal={async () => {
                const n = await refreshExternal(data.works, true);
                showToast(n > 0 ? `${n}作品の情報を確かめました` : "AniListとつながった作品はありません");
              }}
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
                  {visibleMedia(enabledMedia).map((m) => (
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
              pick={o.pick ?? null}
              media={visibleMedia(enabledMedia)}
              onCancel={pop}
              onSave={(work, firstLogs, created) => {
                commit({ works: [work], logs: firstLogs, franchises: created.franchises, people: created.people });
                pop();
                showToast(w ? "保存しました" : `${work.title}を登録しました`);
              }}
            />
          );
        }
        if (o.kind === "log") {
          const w = workById(o.workId);
          const log = data.logs.find((l) => l.id === o.logId && l.deletedAt === null);
          if (!w || w.deletedAt !== null || !log) return null;
          return (
            <LogDetail
              key={key}
              work={w}
              log={log}
              logs={data.logs}
              today={today}
              onBack={pop}
              onEdit={() => setSheet({ workId: w.id, log, newKind: log.kind })}
              onAddLog={() => setSheet({ workId: w.id, log: null, newKind: "view" })}
              onOpenWork={() => push({ kind: "detail", workId: w.id })}
              onOpenLog={(next) => setStack((current) => [...current.slice(0, -1), { kind: "log", workId: w.id, logId: next.id }])}
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
            onAddLog={(kind, finish) => setSheet({ workId: w.id, log: null, newKind: kind, finish })}
            onEditLog={(log) => push({ kind: "log", workId: w.id, logId: log.id })}
            onSetStatus={(s) => setStatus(w, s)}
            onDelete={() => setConfirmDelete(w)}
            onPickVolumes={(mode) => pickVolumes(w, mode)}
            onToggleHomePick={() => toggleHomePick(w)}
            onNewVolume={() => newVolume(w)}
            onAddRerun={() => {
              // 済の作品なら2周目以降として最初から。済でなければ1周目のまま（今期のアニメと「現在」に出す）
              const next = addCurrentRerun(w, today);
              void commit({ works: [next] }).then((ok) => {
                if (ok) showToast(next.rounds > w.rounds ? `今期の再放送を足しました（${next.rounds}周目）` : "今期の再放送を足しました", 5000, { label: "取り消す", onClick: () => commit({ works: [{ ...w, updatedAt: nowIso() }] }) });
              });
            }}
            onStartAgain={() => {
              commit({ works: [startAgain(w)] });
              showToast(w.medium === "manga" ? "読みかけに戻しました（記録は残っています）" : "続きに戻しました（記録は残っています）", 4000, { label: "取り消す", onClick: () => commit({ works: [{ ...w, updatedAt: nowIso() }] }) });
            }}
          />
        );
      })}

      {sheet && sheetWork && (
        <LogSheet
          work={sheetWork}
          logs={data.logs}
          log={sheet.log}
          today={today}
          newKind={sheet.newKind}
          onClose={() => setSheet(null)}
          onSave={(log) => saveLog(sheetWork, log, sheet.log === null, sheet.finish === true)}
          onDelete={(log) => {
            commit({ logs: [{ ...log, deletedAt: nowIso() }] });
            setSheet(null);
            showToast("記録を削除しました", 5000, { label: "取り消す", onClick: () => commit({ logs: [log] }) });
          }}
        />
      )}
      {volSheet && workById(volSheet.workId) && (
        <VolumePickSheet
          work={workById(volSheet.workId)!}
          mode={volSheet.mode}
          onClose={() => setVolSheet(null)}
          onConfirm={(nums, shape) => confirmVolumes(workById(volSheet.workId)!, volSheet.mode, nums, shape)}
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
