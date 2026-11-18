// 続きの計算：放送済み・既刊・未消化、＋1、記録への自動切り替え。
// 外部情報なしで動く（仕様181 §5.1）。かぞえ帳の「毎週たまる」と同じ考え方。
import { PROGRESS_KIND } from "./constants.js";
import { addDays, nowIso } from "./dateUtils.js";
import { courPeriodOf, hasCourIn } from "./courLogic.js";
import type { Log, LogVia, ProgressKind, RangeMedium, VolumeRange, WeeklySchedule, Work } from "./types.js";

export function progressKindOf(work: Pick<Work, "medium">): ProgressKind {
  return PROGRESS_KIND[work.medium];
}

/** firstDate から毎週、today までに来た日（skipDates を除く）。上限 limit 件 */
export function weeklyDates(schedule: WeeklySchedule, today: string, after: string | null = null, limit = 2000): string[] {
  const skips = new Set(schedule.skipDates);
  const out: string[] = [];
  let d = schedule.firstDate;
  for (let i = 0; d <= today && i < limit; i += 1) {
    if (!skips.has(d) && (after === null || d > after)) out.push(d);
    d = addDays(d, 7);
  }
  return out;
}

/**
 * 今日までに出ている最新（放送済みの話数・既刊の巻）。分からなければ null。
 * アニメ・ドラマは schedule があれば放送日から数え、総話数で止める。無ければ手入力の最新。
 * マンガ・小説は総巻数（完結）か手入力の最新巻。
 */
export function availableCount(work: Work, today: string): number | null {
  const kind = progressKindOf(work);
  if (kind === "episode") {
    if (work.schedule) {
      const count = weeklyDates(work.schedule, today).length;
      const latest = count === 0 ? 0 : work.schedule.firstNumber - 1 + count;
      return work.total !== null ? Math.min(latest, work.total) : latest;
    }
    if (work.latestKnown !== null) return work.latestKnown;
    return work.workState === "finished" ? work.total : null;
  }
  if (kind === "volume") {
    if (work.latestKnown !== null) return work.total !== null ? Math.max(work.latestKnown, work.total) : work.latestKnown;
    return work.total;
  }
  return null;
}

/** 週刊誌：まだ読んでいない号の発売日 */
export function unreadIssues(work: Work, today: string): string[] {
  if (!work.schedule) return [];
  return weeklyDates(work.schedule, today, work.readThrough);
}

/** 未消化の数。分からなければ null */
export function unconsumedCount(work: Work, today: string): number | null {
  const kind = progressKindOf(work);
  if (kind === "issue") return work.schedule ? unreadIssues(work, today).length : null;
  if (kind === "none") return null;
  const available = availableCount(work, today);
  if (available === null) return null;
  return Math.max(0, available - (work.progress ?? 0));
}

/** 全部出ていて全部見た／読んだか（＝記録へ自動で移す条件）。完結と分からないときは false */
export function isFullyConsumed(work: Work): boolean {
  const kind = progressKindOf(work);
  if (kind !== "episode" && kind !== "volume") return false;
  if (work.workState !== "finished" || work.total === null || work.progress === null) return false;
  return work.progress >= work.total;
}

/** 状態を自動で直す：進行中・休止中で全部見終わっていたら記録へ。逆に記録中なのに続きが残っていたら進行中へ戻す */
export function withAutoStatus(work: Work, now: string = nowIso()): Work {
  if ((work.status === "active" || work.status === "paused") && isFullyConsumed(work)) {
    return { ...work, status: "done", completedAt: work.completedAt ?? now };
  }
  return work;
}

/** 週刊誌の次に読む号（today までに出ているもの）。無ければ null */
export function nextIssue(work: Work, today: string): string | null {
  const list = unreadIssues(work, today);
  return list.length > 0 ? list[0] : null;
}

export interface StepResult {
  work: Work;
  /** 作る記録の中身（id などは呼び出し側で付ける） */
  log: Pick<Log, "workId" | "kind" | "date" | "position" | "issueDate">;
}

/**
 * ＋1（次の話・次の号・次の巻）。進められないときは null と理由。
 * date は楽しんだ日（長押しで選んだ日。普段は今日）。
 */
export function stepForward(work: Work, date: string, today: string, now: string = nowIso()): StepResult | { error: string } {
  const kind = progressKindOf(work);
  const base = { ...work, touchedAt: now, updatedAt: now, status: work.status === "wish" || work.status === "paused" ? "active" as const : work.status };
  if (kind === "issue") {
    const next = nextIssue(work, today);
    if (!next) return { error: work.schedule ? "次の号はまだ出ていません" : "発売曜日を入れると号を数えられます" };
    return {
      work: { ...base, readThrough: next },
      log: { workId: work.id, kind: "progress", date, position: null, issueDate: next },
    };
  }
  if (kind === "none") return { error: "この作品は続きを数えません" };
  const position = (work.progress ?? 0) + 1;
  if (work.total !== null && position > work.total) return { error: "最後まで進んでいます" };
  const updated = withAutoStatus({ ...base, progress: position }, now);
  return { work: updated, log: { workId: work.id, kind: "progress", date, position, issueDate: null } };
}

/** 位置の表示（例：第12話まで／5巻まで／10月12日号まで） */
export function positionLabel(work: Work): string {
  const kind = progressKindOf(work);
  if (kind === "episode") return work.progress ? `第${work.progress}話まで` : "まだ見ていない";
  if (kind === "volume") return work.progress ? `${work.progress}巻まで` : "まだ読んでいない";
  if (kind === "issue") return work.readThrough ? "" : "まだ読んでいない";
  return "";
}

/** 「最新」の表示（例：最新 第13話／全12話／既刊 20巻） */
export function latestLabel(work: Work, today: string): string {
  const kind = progressKindOf(work);
  const available = availableCount(work, today);
  if (kind === "episode") {
    if (work.workState === "finished" && work.total !== null && available === work.total) return `全${work.total}話`;
    return available !== null ? `放送 第${available}話まで` : "";
  }
  if (kind === "volume") {
    if (available === null) return "";
    return work.workState === "finished" ? `全${available}巻` : `既刊 ${available}巻`;
  }
  return "";
}

/** 持っている巻のうち一番大きい巻（持っていなければ 0） */
export function ownedMax(work: Work): number {
  if (!work.owned) return 0;
  return work.owned.ranges.reduce((m, r) => Math.max(m, r.to), 0);
}

export interface OwnedGapSummary {
  count: number;
  ranges: VolumeRange[];
  text: string;
}

/** 1巻から所持最大巻までの間にある抜け。未購入（所持最大巻より後ろ）とは分けて数える。 */
export function ownedGapSummary(work: Work): OwnedGapSummary {
  if (!work.owned?.known || work.owned.ranges.length === 0) return { count: 0, ranges: [], text: "" };
  const max = ownedMax(work);
  const owned = work.owned.ranges
    .map((range) => ({ from: Math.max(1, range.from), to: Math.min(max, range.to) }))
    .filter((range) => range.from <= range.to)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const ranges: VolumeRange[] = [];
  let next = 1;
  for (const range of owned) {
    if (range.to < next) continue;
    if (range.from > next) ranges.push({ from: next, to: range.from - 1 });
    next = Math.max(next, range.to + 1);
    if (next > max) break;
  }
  if (next <= max) ranges.push({ from: next, to: max });
  const count = ranges.reduce((sum, range) => sum + range.to - range.from + 1, 0);
  return {
    count,
    ranges,
    text: ranges.map((range) => range.from === range.to ? `${range.from}` : `${range.from}-${range.to}`).join(", "),
  };
}

/**
 * 新刊を買うシリーズで、まだ買っていない巻の数（既刊 − 持っている最大の巻）。
 * 「新刊を買う」の印が無い・既刊が分からないときは 0
 */
export function unpurchasedCount(work: Work): number {
  if (!work.buying || progressKindOf(work) !== "volume") return 0;
  const latest = availableCount(work, "9999-12-31");
  if (latest === null) return 0;
  return Math.max(0, latest - ownedMax(work));
}

/** 範囲の並びから、1つの巻だけ取り除く（予約中の巻を買ったとき） */
export function removeVolume(ranges: VolumeRange[], n: number): VolumeRange[] {
  const out: VolumeRange[] = [];
  for (const r of ranges) {
    if (n < r.from || n > r.to) out.push({ ...r });
    else {
      if (r.from < n) out.push({ ...r, to: n - 1 });
      if (n < r.to) out.push({ ...r, from: n + 1 });
    }
  }
  return out;
}

/** 「買った」：持っている巻の次の1巻を足す（範囲がつながっていて形も同じならのばす）。購入の段階は「所持」にする */
export function markBoughtNext(work: Work, now: string = nowIso()): Work {
  const owned = work.owned ?? { known: true, ranges: [], reserved: [], place: null };
  const next = ownedMax(work) + 1;
  const ranges = owned.ranges.map((r) => ({ ...r }));
  const lastRange = ranges.find((r) => r.to === next - 1);
  const fmt = work.purchase.format;
  const medium: RangeMedium = fmt === "paper" || fmt === "kindle" ? fmt : (lastRange?.medium ?? null);
  if (lastRange && (lastRange.medium ?? null) === medium) lastRange.to = next;
  else ranges.push({ from: next, to: next, medium });
  return {
    ...work,
    owned: { ...owned, known: true, ranges, reserved: removeVolume(owned.reserved, next) },
    purchase: { ...work.purchase, stage: "owned" },
    updatedAt: now,
    touchedAt: now,
  };
}

/** 「新刊が出た」：既刊を1つ増やす（既刊が分からなければ、持っている巻・読んだ巻の大きい方の次） */
export function markNewVolume(work: Work, now: string = nowIso()): Work {
  const base = Math.max(availableCount(work, "9999-12-31") ?? 0, ownedMax(work), work.progress ?? 0);
  return withAutoStatus({ ...work, latestKnown: base + 1, workState: work.workState === "finished" ? "ongoing" : work.workState, updatedAt: now, touchedAt: now }, now);
}

export type ContinueGroup = "following" | "reading";

export interface ContinueContext {
  today: string;
  /** その作品の一番新しい記録の視聴手段（無ければ null＝放送として扱う） */
  latestVia: LogVia | null;
}

/**
 * 続きタブの置き場（2026-11-18 状態の設計を作品の状態ベースに直した）。
 * 追っている（following）＝アニメ・ドラマは「放送予定が入っている」か「放送中で今期のクールが付いていて、最新の記録が配信でない」もの。
 * 週刊誌・「続きの巻も買う」マンガ・プレイ中のゲームはそのまま追っている。
 * 途中（reading）＝追っているに入らない進行中すべて（完結した作品の続き、配信で後から追っている作品、読みかけのマンガ、読書中の小説）。
 * 進行中でないもの・続きも途中も持たないものは null。予定（これから）と中断は状態で分ける
 */
export function continueGroup(work: Work, ctx: ContinueContext = { today: "9999-12-31", latestVia: null }): ContinueGroup | null {
  // 読了・積読・中断でも、買う新刊が残っているマンガは「追っている」に出す。状態自体は変えない。
  if (work.medium === "manga" && work.buying && unpurchasedCount(work) > 0) return "following";
  if (work.status !== "active") return null;
  // プレイ中のゲーム（ポケポケなど）は「追っている」に並べる
  if (work.medium === "game") return "following";
  // 小説は巻を数えないが、読みかけを置ける
  if (work.medium === "novel") return "reading";
  const kind = progressKindOf(work);
  if (kind === "none") return null;
  if (work.medium === "manga") return work.buying ? "following" : "reading";
  if (kind === "episode") {
    if (work.schedule) return "following";
    if (work.workState === "ongoing" && hasCourIn(work, courPeriodOf(ctx.today)) && ctx.latestVia !== "streaming") return "following";
    return "reading";
  }
  return "following";
}

/** 積読：予定（まだ読み始めていない）で、手元にある（購入の段階が所持）。表示だけの自動判定 */
export function isTsundoku(work: Pick<Work, "status" | "purchase">): boolean {
  return work.status === "wish" && work.purchase.stage === "owned";
}

/** 「2周目」など。1周目は出さない */
export function roundsLabel(work: Pick<Work, "rounds">): string {
  return work.rounds >= 2 ? `${work.rounds}周目` : "";
}

/**
 * 新刊待ち：マンガで、進行中、作品が完結していない、読んだ巻が最新の巻と同じ。
 * 表示だけの自動判定で、保存はしない。
 */
export function isWaitingForNewVolume(work: Work, today: string): boolean {
  if (work.medium !== "manga" || work.status !== "active" || work.workState === "finished") return false;
  const available = availableCount(work, today);
  return available !== null && available > 0 && work.progress === available;
}

/** 次にやることがある（未消化・未購入がある）か */
export function hasNext(work: Work, today: string): boolean {
  return (unconsumedCount(work, today) ?? 0) > 0 || unpurchasedCount(work) > 0;
}

/** 再読・再視聴：記録はそのまま、位置を最初に戻して進行中へ */
export function startAgain(work: Work, now: string = nowIso()): Work {
  return { ...work, status: "active", progress: null, rounds: Math.max(1, work.rounds) + 1, completedAt: null, touchedAt: now, updatedAt: now };
}
