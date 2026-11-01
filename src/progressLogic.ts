// 続きの計算：放送済み・既刊・未消化、＋1、記録への自動切り替え。
// 外部情報なしで動く（仕様181 §5.1）。かぞえ帳の「毎週たまる」と同じ考え方。
import { PROGRESS_KIND } from "./constants.js";
import { addDays, nowIso } from "./dateUtils.js";
import type { Log, ProgressKind, WeeklySchedule, Work } from "./types.js";

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
    return work.finished === true ? work.total : null;
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
  if (work.finished !== true || work.total === null || work.progress === null) return false;
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
    if (work.finished === true && work.total !== null && available === work.total) return `全${work.total}話`;
    return available !== null ? `放送 第${available}話まで` : "";
  }
  if (kind === "volume") {
    if (available === null) return "";
    return work.finished === true ? `全${available}巻` : `既刊 ${available}巻`;
  }
  return "";
}

/** 持っている巻のうち一番大きい巻（持っていなければ 0） */
export function ownedMax(work: Work): number {
  if (!work.owned) return 0;
  return work.owned.ranges.reduce((m, r) => Math.max(m, r.to), 0);
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

/** 「買った」：持っている巻の次の1巻を足す（範囲がつながっていればのばす） */
export function markBoughtNext(work: Work, now: string = nowIso()): Work {
  const owned = work.owned ?? { known: true, ranges: [], medium: null, place: null };
  const next = ownedMax(work) + 1;
  const ranges = owned.ranges.map((r) => ({ ...r }));
  const last = ranges.find((r) => r.to === next - 1);
  if (last) last.to = next;
  else ranges.push({ from: next, to: next });
  return { ...work, owned: { ...owned, known: true, ranges }, updatedAt: now, touchedAt: now };
}

/** 「新刊が出た」：既刊を1つ増やす（既刊が分からなければ、持っている巻・読んだ巻の大きい方の次） */
export function markNewVolume(work: Work, now: string = nowIso()): Work {
  const base = Math.max(availableCount(work, "9999-12-31") ?? 0, ownedMax(work), work.progress ?? 0);
  return withAutoStatus({ ...work, latestKnown: base + 1, finished: work.finished === true ? false : work.finished, updatedAt: now, touchedAt: now }, now);
}

export type ContinueGroup = "following" | "reading";

/**
 * 続きタブの置き場（2026-11-01 本人と認識合わせ）。
 * 追っている＝今期のアニメ・ドラマ・週刊誌と、新刊を買うマンガ。読みかけ＝新刊を買う印のない進行中のマンガ（再読中も）。
 * 進行中でないもの・続きを数えないものは null
 */
export function continueGroup(work: Work): ContinueGroup | null {
  if (work.status !== "active") return null;
  // プレイ中のゲーム（ポケポケなど）は「追っている」に並べる
  if (work.medium === "game") return "following";
  const kind = progressKindOf(work);
  if (kind === "none") return null;
  if (work.medium === "manga") return work.buying ? "following" : "reading";
  return "following";
}

/** 次にやることがある（未消化・未購入がある）か */
export function hasNext(work: Work, today: string): boolean {
  return (unconsumedCount(work, today) ?? 0) > 0 || unpurchasedCount(work) > 0;
}

/** 再読・再視聴：記録はそのまま、位置を最初に戻して進行中へ */
export function startAgain(work: Work, now: string = nowIso()): Work {
  return { ...work, status: "active", progress: null, completedAt: null, touchedAt: now, updatedAt: now };
}
