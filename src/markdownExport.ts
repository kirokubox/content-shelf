// 全記録をテキスト（Markdown）で書き出す。好きなもの台帳やAIの振り返りの材料（仕様181 §6.1）
import { MEDIUM_LABEL, STATUS_LABEL } from "./constants.js";
import { isoToDateKey } from "./dateUtils.js";
import { personNames } from "./linkLogic.js";
import { progressKindOf } from "./progressLogic.js";
import type { DataSet, Log, Work } from "./types.js";
import { MEDIA } from "./types.js";

function stars(n: number | null): string {
  return n ? `★${n}` : "";
}

function logLine(work: Work, l: Log): string {
  const kind = progressKindOf(work);
  const what = l.position ? (kind === "episode" ? `第${l.position}話` : `${l.position}巻`) : l.issueDate ? `${l.issueDate}発売の号` : "";
  const parts = [l.date, what, l.place, stars(l.rating)].filter(Boolean).join("　");
  const note = l.note ? `\n    - ${l.note.replace(/\n+/g, "\n      ")}` : "";
  return `  - ${parts}${note}`;
}

/** from〜to（YYYY-MM-DD、どちらも含む）の記録だけにするときは range を渡す */
export function buildMarkdown(data: DataSet, exportedAt: string, range?: { from: string; to: string }): string {
  const logsByWork = new Map<string, Log[]>();
  for (const l of data.logs) {
    if (l.deletedAt !== null) continue;
    if (range && (l.date < range.from || l.date > range.to)) continue;
    logsByWork.set(l.workId, [...(logsByWork.get(l.workId) ?? []), l]);
  }
  const lines: string[] = ["# コンテンツ棚の記録", "", `- 書き出し：${exportedAt}`];
  if (range) lines.push(`- 期間：${range.from}〜${range.to}（期間内に記録がある作品だけ）`);
  lines.push("- 「状態」は書き出した時点のもの。話数・巻は記録したものだけで、空欄は分からないことを表す", "");
  for (const m of MEDIA) {
    const works = data.works
      .filter((w) => w.deletedAt === null && w.medium === m)
      .filter((w) => !range || logsByWork.has(w.id))
      .sort((a, b) => a.title.localeCompare(b.title, "ja"));
    if (works.length === 0) continue;
    lines.push(`## ${MEDIUM_LABEL[m]}（${works.length}）`, "");
    for (const w of works) {
      const fr = w.franchiseId ? data.franchises.find((f) => f.id === w.franchiseId)?.title : undefined;
      const people = personNames(data, w.personIds);
      const head = [w.title + (w.seasonLabel ? ` ${w.seasonLabel}` : ""), STATUS_LABEL[w.status]];
      if (w.progress) head.push(progressKindOf(w) === "episode" ? `第${w.progress}話まで` : `${w.progress}巻まで`);
      if (w.status === "done" && w.completedAt) head.push(`記録へ ${isoToDateKey(w.completedAt)}`);
      lines.push(`- ${head.join("｜")}`);
      if (fr) lines.push(`  - 親作品：${fr}`);
      if (people.length) lines.push(`  - 人物：${people.join("、")}`);
      if (w.setlist) lines.push(`  - セットリスト：${w.setlist.replace(/\n+/g, " / ")}`);
      if (w.memo) lines.push(`  - メモ：${w.memo.replace(/\n+/g, " ")}`);
      const logs = (logsByWork.get(w.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
      for (const l of logs) lines.push(logLine(w, l));
    }
    lines.push("");
  }
  return lines.join("\n");
}
