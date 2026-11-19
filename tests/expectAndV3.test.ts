// 楽しみの日・楽しみの予定・版2→版3の移し替え・2周目からの登録・日付不明の記録（v0.17.0）。架空データだけを使う
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, parseBackup } from "../src/backup.js";
import { compareFuzzy, formatFuzzy, fuzzyEnd, isPastFuzzy, nextExpect, upcomingByMedium, workExpect } from "../src/expectLogic.js";
import { describeMigrationV3, hasV2Works, isV2Work, migrateV2ToV3 } from "../src/migrate.js";
import { buildMarkdown } from "../src/markdownExport.js";
import { formatLogDate, dateKeyFromInput } from "../src/dateUtils.js";
import { logInRange } from "../src/exportRange.js";
import { summarize } from "../src/summaryLogic.js";
import { emptyWork, newLog } from "../src/workFactory.js";
import { shapeText, accessText, purchaseFormatText, expectLabel } from "../src/constants.js";
import { UNKNOWN_DATE } from "../src/types.js";
import type { FuzzyDate, Work } from "../src/types.js";

const NOW = "2026-11-19T03:00:00.000Z";
const TODAY = "2026-11-19";
const day = (date: string): FuzzyDate => ({ date, precision: "day" });

test("楽しみの日：月だけ・年だけは、その月・年の終わりで並べ、終わるまで過去にしない", () => {
  assert.equal(fuzzyEnd({ date: "2026-02-01", precision: "month" }), "2026-02-28");
  assert.equal(fuzzyEnd({ date: "2027-01-01", precision: "year" }), "2027-12-31");
  assert.equal(isPastFuzzy(day("2026-11-18"), TODAY), true);
  assert.equal(isPastFuzzy(day("2026-11-19"), TODAY), false);
  assert.equal(isPastFuzzy({ date: "2026-11-01", precision: "month" }, TODAY), false);
  assert.equal(isPastFuzzy({ date: "2026-10-01", precision: "month" }, TODAY), true);
  const sorted = [{ date: "2027-01-01", precision: "year" as const }, { date: "2026-12-01", precision: "month" as const }, day("2026-12-31"), day("2026-12-05")].sort(compareFuzzy);
  assert.deepEqual(sorted.map((d) => `${d.date}/${d.precision}`), ["2026-12-05/day", "2026-12-31/day", "2026-12-01/month", "2027-01-01/year"]);
  assert.equal(formatFuzzy({ date: "2026-12-01", precision: "month" }, TODAY), "12月");
  assert.equal(formatFuzzy({ date: "2027-01-01", precision: "year" }, TODAY), "2027年");
  assert.equal(formatFuzzy(day("2026-12-20"), TODAY), "12月20日（日）");
  assert.deepEqual(["anime", "movie", "live", "novel", "manga"].map((m) => expectLabel(m as never)), ["放送開始日", "公開日", "開催日", "発売日", "発売日"]);
});

test("アニメの放送開始日は、放送予定があればその初回の日（二重に持たない）", () => {
  const a = { ...emptyWork("anime", NOW), expect: day("2027-01-01"), schedule: { firstDate: "2027-01-08", firstNumber: 1, skipDates: [] } };
  assert.deepEqual(workExpect(a), day("2027-01-08"));
  assert.deepEqual(workExpect({ ...a, schedule: null }), day("2027-01-01"));
});

test("楽しみの予定：種類ごとにいちばん近いものを1件。過去と日付の無いもの・済の作品は出さない。マンガは巻ごとの日も見る", () => {
  const mk = (id: string, medium: Work["medium"], patch: Partial<Work>) => ({ ...emptyWork(medium, NOW), id, title: id, status: "wish" as const, ...patch });
  const works: Work[] = [
    mk("novel-late", "novel", { expect: day("2027-02-01") }),
    mk("novel-soon", "novel", { expect: { date: "2026-12-01", precision: "month" } }),
    mk("novel-past", "novel", { expect: day("2026-11-01") }),
    mk("novel-none", "novel", {}),
    mk("movie-done", "movie", { status: "done", expect: day("2026-12-01") }),
    mk("movie", "movie", { expect: { date: "2027-01-01", precision: "year" } }),
    mk("live", "live", { expect: day("2026-11-19") }),
    mk("anime", "anime", { schedule: { firstDate: "2027-01-08", firstNumber: 1, skipDates: [] } }),
    mk("manga", "manga", { status: "done", owned: { known: true, ranges: [{ from: 1, to: 11 }], reserved: [{ from: 12, to: 12 }], place: null, volumeDates: [{ volume: 11, date: day("2026-12-01") }, { volume: 12, date: day("2026-12-04") }] } }),
  ];
  const r = upcomingByMedium(works, TODAY);
  assert.deepEqual(r.map((u) => u.work.id), ["live", "manga", "novel-soon", "anime", "movie"]);
  // 済のマンガでも、まだ持っていない巻の発売日は楽しみ（持っている11巻は出さない）
  assert.equal(r.find((u) => u.work.id === "manga")!.volume, 12);
  assert.equal(r.find((u) => u.work.id === "anime")!.label, "放送開始");
  assert.equal(nextExpect(works[4], TODAY), null);
});

/** 版2（v0.16）の形の作品を作る：v0.17で足した項目を消し、Kindle・ジャンプ＋を古い値にする */
function v2Work(patch: Record<string, unknown>): Record<string, unknown> {
  const { expect, homePick, accessStore, ...rest } = emptyWork("manga", NOW) as unknown as Record<string, unknown>;
  void expect; void homePick; void accessStore;
  return { ...rest, ...patch };
}

test("版2→版3：紙はそのまま、Kindle は 電子・Kindle、ジャンプ＋は 電子・ジャンプ＋。件数は合い、元は変えない", () => {
  const works = [
    v2Work({ id: "a", title: "架空A", owned: { known: true, ranges: [{ from: 1, to: 3, medium: "paper" }, { from: 4, to: 6, medium: "kindle" }], reserved: [{ from: 7, to: 7, medium: "kindle" }], place: null }, purchase: { stage: "owned", format: "kindle" } }),
    v2Work({ id: "b", title: "架空B", access: "jump_plus", purchase: { stage: "none", format: null } }),
    v2Work({ id: "c", title: "架空C", medium: "anime", owned: null, access: "streaming", purchase: { stage: "none", format: null } }),
    v2Work({ id: "d", title: "架空D", owned: { known: true, ranges: [{ from: 1, to: 2, medium: "paper" }, { from: 3, to: 3, medium: "kindle" }], reserved: [], place: null }, purchase: { stage: "owned", format: "paper" } }),
  ];
  const logs = [newLog({ workId: "a", kind: "progress", date: "2026-11-01", position: 1 }, NOW)];
  assert.equal(isV2Work(works[0]), true);
  assert.equal(hasV2Works(works), true);
  assert.equal(isV2Work(emptyWork("manga", NOW)), false);
  const before = JSON.stringify(works);
  const r = migrateV2ToV3({ franchises: [], works, logs, people: [], photos: ["p1"] }, NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(JSON.stringify(works), before);
  assert.deepEqual(r.report.before, r.report.after);
  const a = r.data.works.find((w) => w.id === "a")!;
  assert.deepEqual(a.owned!.ranges, [{ from: 1, to: 3, medium: "paper", store: null }, { from: 4, to: 6, medium: "digital", store: "kindle" }]);
  assert.deepEqual(a.owned!.reserved, [{ from: 7, to: 7, medium: "digital", store: "kindle" }]);
  assert.deepEqual(a.purchase, { stage: "owned", format: "digital", store: "kindle" });
  assert.deepEqual([a.expect, a.homePick, a.owned!.volumeDates], [null, false, []]);
  const b = r.data.works.find((w) => w.id === "b")!;
  assert.deepEqual([b.access, b.accessStore], ["digital", "jump_plus"]);
  const c = r.data.works.find((w) => w.id === "c")!;
  assert.deepEqual([c.access, c.accessStore], ["streaming", null]);
  assert.deepEqual([r.report.rangeKindle, r.report.rangePaper, r.report.formatKindle, r.report.accessJumpPlus, r.report.accessStreaming], [2, 2, 1, 1, 1]);
  // 紙と電子が混ざっていて購入の形が1つのものは、自動で判断できなかった一覧へ
  assert.deepEqual(r.report.manual.map((m) => m.workId), ["a", "d"]);
  assert.ok(describeMigrationV3(r.report).some((l) => l.includes("自動で判断できなかった作品：2件")));
  // 表示
  assert.equal(shapeText("digital", "kindle"), "電子・Kindle");
  assert.equal(accessText(b.access, b.accessStore), "電子・ジャンプ＋");
  assert.equal(accessText("manga_cafe", null), "漫喫");
  assert.equal(purchaseFormatText("digital", null), "電子");
});

test("版2のバックアップを読むと版3へ移してから取り込み、書き出すと版3。版3はそのまま読める", () => {
  const works = [v2Work({ id: "a", title: "架空A", owned: { known: true, ranges: [{ from: 1, to: 2, medium: "kindle" }], reserved: [], place: null }, purchase: { stage: "owned", format: "kindle" } })];
  const file = { app: "content-shelf", version: 2, exportedAt: NOW, franchises: [], works, logs: [], people: [] };
  const r = parseBackup(JSON.stringify(file));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.migrationV3);
  assert.equal(r.data.works[0].owned!.ranges[0].store, "kindle");
  const out = buildBackup(r.data, NOW);
  assert.equal(out.version, 3);
  const again = parseBackup(JSON.stringify(out));
  assert.ok(again.ok);
  if (!again.ok) return;
  assert.equal(again.migrationV3, null);
  assert.deepEqual(again.data.works, r.data.works);
});

test("日付不明の記録：表示は「日付不明」、週・月・年の書き出しと集計には入らず、全期間には出る", () => {
  assert.equal(dateKeyFromInput("", "unknown"), UNKNOWN_DATE);
  assert.equal(formatLogDate(UNKNOWN_DATE, "unknown", TODAY), "日付不明");
  assert.equal(logInRange(UNKNOWN_DATE, "unknown", { from: "1900-01-01", to: "9999-12-31" }), false);
  const w = { ...emptyWork("novel", NOW), id: "n", title: "架空小説", rounds: 2, status: "active" as const };
  const l = newLog({ workId: "n", kind: "view", date: UNKNOWN_DATE, datePrecision: "unknown" }, NOW);
  const data = { franchises: [], people: [], works: [w], logs: [l] };
  assert.deepEqual(summarize(data, "year", TODAY), []);
  const md = buildMarkdown(data, NOW);
  assert.ok(md.includes("  - 日付不明"), md);
  assert.ok(md.includes("｜2周目"), md);
});

test("書き出し：購入・形・読む手段・楽しみの日・予約中の巻が新しい名前で出る", () => {
  const w: Work = {
    ...emptyWork("manga", NOW), id: "m", title: "架空マンガ", status: "active",
    purchase: { stage: "owned", format: "digital", store: "kindle" }, access: "manga_cafe", expect: { date: "2027-01-01", precision: "year" },
    owned: { known: true, ranges: [{ from: 1, to: 3, medium: "digital", store: "kindle" }], reserved: [{ from: 4, to: 4 }], place: null, volumeDates: [{ volume: 4, date: day("2026-12-04") }] },
  };
  const md = buildMarkdown({ franchises: [], people: [], works: [w], logs: [] }, NOW);
  assert.ok(md.includes("購入：持ってる（電子・Kindle）｜読む手段：漫喫｜発売日：2027"), md);
  assert.ok(md.includes("  - 予約中の巻：4"), md);
  assert.ok(md.includes("  - 巻ごとの発売日：4巻 2026-12-04"), md);
});
