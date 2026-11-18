// データの形の版1 → 版2 の移し替え（v0.16.0）。
// 端末のデータ（IndexedDB）と、版1のバックアップの読み込みで同じ関数を使う。純粋ロジックで、何も書き込まない。
// 元のデータは変えず、新しい形のコピーを返す。件数が合わなければ失敗（呼び出し側は何も書き込まない）。
import { PROGRESS_KIND } from "./constants.js";
import { normalizeLog, normalizeWork } from "./dataOps.js";
import { parseSeasonLabel } from "./courLogic.js";
import type { Access, Cour, DataSet, Log, LogVia, PurchaseFormat, PurchaseStage, RangeMedium, VolumeRange, Work, WorkState } from "./types.js";
import { LOG_VIAS, MEDIA, PURCHASE_FORMATS } from "./types.js";

type Rec = Record<string, unknown>;

/** 版1の形のデータ（作品・記録・人物・親作品・写真の情報）。形の検証は呼び出し側（backup.ts）が済ませている前提 */
export interface LegacyData {
  franchises: unknown[];
  works: unknown[];
  logs: unknown[];
  people: unknown[];
  /** 写真の情報（あれば。そのまま通す） */
  photos?: unknown[];
}

export interface ManualItem {
  workId: string;
  title: string;
  reason: string;
}

export interface MigrationCounts {
  works: number;
  logs: number;
  people: number;
  franchises: number;
  photos: number;
}

export interface MigrationReport {
  at: string;
  before: MigrationCounts;
  after: MigrationCounts;
  /** クールが付いた作品の数 */
  cours: number;
  /** 期・編・巻の名前に移った作品の数 */
  partLabels: number;
  /** 周回数が2以上の作品の数 */
  rounds2plus: number;
  workState: Record<"upcoming" | "ongoing" | "finished" | "unknown", number>;
  via: Record<LogVia, number>;
  purchase: Record<PurchaseStage, number>;
  access: Record<"jump_plus" | "streaming", number>;
  /** 自動で判断できなかった作品 */
  manual: ManualItem[];
}

export type MigrationResult = { ok: true; data: DataSet; photos: unknown[]; report: MigrationReport } | { ok: false; error: string };

/** 版1の作品か（版2の作品は workState の項目を必ず持つ） */
export function isLegacyWork(w: unknown): boolean {
  return typeof w === "object" && w !== null && !("workState" in w);
}

export function hasLegacyWorks(works: readonly unknown[]): boolean {
  return works.some(isLegacyWork);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const PLACE_TO_VIA: Record<string, LogVia> = { テレビ: "broadcast", DVDレンタル: "disc", 配信: "streaming", 映画館: "venue" };

/** 記録の場所の文字から視聴手段を決める（場所の文字そのものは消さない） */
export function viaFromPlace(place: string, medium: string): LogVia | null {
  const p = place.trim();
  if (PLACE_TO_VIA[p]) return PLACE_TO_VIA[p];
  if (medium === "live" && p) return "venue";
  return null;
}

/** 周回数：位置が前より戻った回数＋1。並びが決められないときは ambiguous（周回数は1） */
export function countRounds(logs: readonly { date: string; createdAt: string; position: number; precision?: string }[]): { rounds: number; ambiguous: boolean } {
  const drops = (sorted: readonly { position: number }[]) => {
    let n = 0;
    for (let i = 1; i < sorted.length; i += 1) if (sorted[i].position < sorted[i - 1].position) n += 1;
    return n;
  };
  const byCreated = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const byPosition = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position);
  const a = drops(byCreated);
  const b = drops(byPosition);
  if (a !== b) return { rounds: 1, ambiguous: true };
  // 年・年月だけの記録で、同じ日付の中に位置の違う記録が並ぶときは順番が決められない
  const imprecise = logs.some((l) => l.precision === "month" || l.precision === "year");
  if (imprecise && a > 0) {
    const sameDay = new Map<string, Set<number>>();
    for (const l of logs) sameDay.set(l.date, (sameDay.get(l.date) ?? new Set()).add(l.position));
    if (Array.from(sameDay.values()).some((s) => s.size > 1)) return { rounds: 1, ambiguous: true };
  }
  return { rounds: a + 1, ambiguous: false };
}

function emptyReport(at: string, before: MigrationCounts): MigrationReport {
  return {
    at,
    before,
    after: { works: 0, logs: 0, people: 0, franchises: 0, photos: 0 },
    cours: 0,
    partLabels: 0,
    rounds2plus: 0,
    workState: { upcoming: 0, ongoing: 0, finished: 0, unknown: 0 },
    via: { broadcast: 0, rerun: 0, streaming: 0, disc: 0, recording: 0, venue: 0 },
    purchase: { none: 0, planned: 0, reserved: 0, owned: 0 },
    access: { jump_plus: 0, streaming: 0 },
    manual: [],
  };
}

function toRanges(v: unknown, medium: RangeMedium): VolumeRange[] {
  if (!Array.isArray(v)) return [];
  return (v as Rec[]).filter((r) => typeof r?.from === "number" && typeof r?.to === "number").map((r) => ({ from: r.from as number, to: r.to as number, medium }));
}

/** 版1 → 版2。件数が合わないときは失敗する（何も書かせない） */
export function migrateV1ToV2(input: LegacyData, now: string = new Date().toISOString()): MigrationResult {
  const photosIn = input.photos ?? [];
  const before: MigrationCounts = { works: input.works.length, logs: input.logs.length, people: input.people.length, franchises: input.franchises.length, photos: photosIn.length };
  const report = emptyReport(now, before);

  // 作品ごとの記録（消した記録は数えない）
  const logsByWork = new Map<string, Rec[]>();
  for (const l of input.logs as Rec[]) {
    if (l.deletedAt !== null && l.deletedAt !== undefined) continue;
    const id = str(l.workId);
    logsByWork.set(id, [...(logsByWork.get(id) ?? []), l]);
  }

  const works: Work[] = [];
  for (const raw of input.works as Rec[]) {
    if (!isLegacyWork(raw)) {
      // すでに版2の形（混ざっていても落とさない）
      works.push(normalizeWork(raw as unknown as Work));
      continue;
    }
    const { seasonLabel, finished, videoOwned, ownFormat, ...rest } = raw;
    const id = str(raw.id);
    const title = str(raw.title);
    const mediumRaw = str(raw.medium);
    const medium = (MEDIA as readonly string[]).includes(mediumRaw) ? (mediumRaw as Work["medium"]) : "other";
    const kind = PROGRESS_KIND[medium];
    const myLogs = logsByWork.get(id) ?? [];
    const manual = (reason: string) => report.manual.push({ workId: id, title, reason });

    // 作品の状態
    let workState: WorkState = finished === true ? "finished" : finished === false ? "ongoing" : null;
    if (kind === "none") {
      const viewed = myLogs.some((l) => l.kind === "view");
      workState = viewed || raw.status === "done" ? "finished" : null;
    }

    // 期・編・巻とクール
    const label = str(seasonLabel).trim();
    const cours: Cour[] = [];
    let partLabel = "";
    if (label) {
      const cour = parseSeasonLabel(label);
      if (cour) cours.push(cour);
      else {
        partLabel = label;
        if (label.includes("年") || /[春夏秋冬]/.test(label)) manual(`「${label}」は期・編・巻の名前に入れました（クールかどうか判断できませんでした）`);
      }
    }

    // 周回数（話・巻を数える種類だけ）
    let rounds = 1;
    if (kind === "episode" || kind === "volume") {
      const series = myLogs
        .filter((l) => l.kind === "progress" && typeof l.position === "number")
        .map((l) => ({ date: str(l.date), createdAt: str(l.createdAt), position: l.position as number, precision: str(l.datePrecision) }));
      if (series.length >= 2) {
        const r = countRounds(series);
        rounds = r.rounds;
        if (r.ambiguous) manual("記録の並びから周回数を決められませんでした（1周目のままです）");
      }
    }

    // 購入・読む見る手段
    const owned = raw.owned && typeof raw.owned === "object" ? (raw.owned as Rec) : null;
    const ownedMedium = owned ? owned.medium : null;
    const rangeMedium: RangeMedium = ownedMedium === "paper" || ownedMedium === "kindle" ? ownedMedium : null;
    const ranges = owned ? toRanges(owned.ranges, rangeMedium) : [];
    let access: Access = ownedMedium === "jump_plus" ? "jump_plus" : null;
    let stage: PurchaseStage = "none";
    const formats: PurchaseFormat[] = [];
    if (ranges.length > 0) {
      stage = "owned";
      if (rangeMedium) formats.push(rangeMedium);
    }
    const own = (PURCHASE_FORMATS as readonly unknown[]).includes(ownFormat) ? (ownFormat as PurchaseFormat) : null;
    if (own) {
      stage = "owned";
      formats.push(own);
    }
    if (videoOwned === "dvd" || videoOwned === "bluray") {
      stage = "owned";
      formats.push(videoOwned);
    } else if (videoOwned === "digital") {
      if (access === null) access = "streaming";
      else manual("配信の印が、ジャンプ＋の印と重なっていたため入れられませんでした（移し替え前のデータに残っています）");
    }
    if (new Set(formats).size > 1) manual(`購入の形が複数ありました（${Array.from(new Set(formats)).join("・")}）。最初の1つだけを入れました`);
    if (str(raw.memo).includes("購入予定")) {
      if (stage === "owned") manual("所持の印と、メモの「購入予定」が両方ありました（所持にしました。メモは残っています）");
      else stage = "planned";
    }

    const newOwned = owned
      ? { known: owned.known === true, ranges, reserved: [] as VolumeRange[], place: owned.place ?? null }
      : null;
    const work = normalizeWork({
      ...rest,
      partLabel,
      cours,
      rounds,
      workState,
      purchase: { stage, format: formats[0] ?? null },
      access,
      owned: newOwned,
    } as unknown as Work);

    if (cours.length > 0) report.cours += 1;
    if (partLabel) report.partLabels += 1;
    if (rounds >= 2) report.rounds2plus += 1;
    works.push(work);
  }

  const mediumById = new Map((input.works as Rec[]).map((w) => [str(w.id), str(w.medium)]));
  const logs: Log[] = (input.logs as Rec[]).map((l) => {
    if ("via" in l) return normalizeLog(l as unknown as Log);
    return normalizeLog({ ...l, via: viaFromPlace(str(l.place), mediumById.get(str(l.workId)) ?? "") } as unknown as Log);
  });

  for (const w of works) {
    report.workState[w.workState ?? "unknown"] += 1;
    report.purchase[w.purchase.stage] += 1;
    if (w.access) report.access[w.access] += 1;
  }
  for (const l of logs) if (l.via && (LOG_VIAS as readonly string[]).includes(l.via)) report.via[l.via] += 1;

  const data: DataSet = { franchises: input.franchises as DataSet["franchises"], works, logs, people: input.people as DataSet["people"] };
  report.after = { works: works.length, logs: logs.length, people: data.people.length, franchises: data.franchises.length, photos: photosIn.length };
  for (const k of ["works", "logs", "people", "franchises", "photos"] as const) {
    if (report.before[k] !== report.after[k]) return { ok: false, error: `移し替えの前後で件数が合いませんでした（${k}：${report.before[k]}件 → ${report.after[k]}件）。何も書き込んでいません。` };
  }
  return { ok: true, data, photos: photosIn, report };
}

/** 移し替えの結果を、画面とスクリプトで見せる文字（1行ずつ） */
export function describeMigration(r: MigrationReport): string[] {
  const c = r.after;
  const lines = [
    `件数（前→後）：作品 ${r.before.works}→${c.works}、記録 ${r.before.logs}→${c.logs}、人物 ${r.before.people}→${c.people}、親作品 ${r.before.franchises}→${c.franchises}、写真 ${r.before.photos}→${c.photos}`,
    `クールへ：${r.cours}作品　期・編・巻の名前へ：${r.partLabels}作品　2周目以上：${r.rounds2plus}作品`,
    `作品の状態：開始前 ${r.workState.upcoming}・進行中 ${r.workState.ongoing}・完結 ${r.workState.finished}・不明 ${r.workState.unknown}`,
    `視聴手段：放送 ${r.via.broadcast}・再放送 ${r.via.rerun}・配信 ${r.via.streaming}・円盤 ${r.via.disc}・録画 ${r.via.recording}・劇場／会場 ${r.via.venue}`,
    `購入：未所持 ${r.purchase.none}・購入予定 ${r.purchase.planned}・予約済 ${r.purchase.reserved}・所持 ${r.purchase.owned}`,
    `読む・見る手段：ジャンプ＋ ${r.access.jump_plus}・配信 ${r.access.streaming}`,
    `自動で判断できなかった作品：${r.manual.length}件`,
  ];
  for (const m of r.manual) lines.push(`  ・${m.title || "（題名なし）"}：${m.reason}`);
  return lines;
}
