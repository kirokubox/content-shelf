import { progressKindOf } from "./progressLogic.js";
import type { Log, Work } from "./types.js";

/** 読む画面で行き来する、同じ作品の有効な記録。古い順に並べる。 */
export function readerLogs(logs: readonly Log[], workId: string): Log[] {
  return logs
    .filter((log) => log.workId === workId && log.deletedAt === null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function readerPosition(logs: readonly Log[], workId: string, logId: string): { index: number; total: number; previous: Log | null; next: Log | null } {
  const ordered = readerLogs(logs, workId);
  const index = ordered.findIndex((log) => log.id === logId);
  return {
    index,
    total: ordered.length,
    previous: index > 0 ? ordered[index - 1] : null,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
  };
}

export function addReaderLogLabel(work: Work): string {
  return progressKindOf(work) === "none" ? "この作品にもう1件記録する" : "感想を残す";
}
