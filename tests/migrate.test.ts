import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBackup, parseBackup } from "../src/backup.js";
import { describeMigration, migrateV1ToV2, viaFromPlace } from "../src/migrate.js";
import type { LegacyData, MigrationReport } from "../src/migrate.js";
import type { DataSet, Work } from "../src/types.js";

// 架空の版1データ（作品14・記録46・親作品1・人物1・写真1）
const legacy = JSON.parse(readFileSync("tests/fixtures/legacy-v1-sample.json", "utf-8")) as LegacyData & { version: number };

function migrate(): { data: DataSet; report: MigrationReport } {
  const r = migrateV1ToV2(legacy, "2026-11-18T00:00:00.000Z");
  if (!r.ok) throw new Error(r.error);
  return r;
}
const byTitle = (data: DataSet, title: string): Work => data.works.find((w) => w.title === title)!;

test("件数が前後で一致し、元のデータは書き換えない", () => {
  const before = JSON.stringify(legacy);
  const { data, report } = migrate();
  assert.equal(JSON.stringify(legacy), before);
  assert.deepEqual(report.before, report.after);
  assert.deepEqual(report.after, { works: 14, logs: 46, people: 1, franchises: 1, photos: 1 });
  assert.equal(data.works.length, 14);
  assert.equal(data.logs.length, 46);
  // 版1の項目は残らない
  for (const w of data.works) {
    const x = w as unknown as Record<string, unknown>;
    for (const k of ["seasonLabel", "finished", "videoOwned", "ownFormat"]) assert.equal(k in x, false, k);
  }
});

test("作品の状態：完結・進行中・不明。単発ものは記録か済があれば完結", () => {
  const { data } = migrate();
  assert.equal(byTitle(data, "架空アニメA").workState, "ongoing");
  assert.equal(byTitle(data, "架空アニメB").workState, "finished");
  assert.equal(byTitle(data, "架空アニメC").workState, null);
  assert.equal(byTitle(data, "架空小説G").workState, "finished");
  assert.equal(byTitle(data, "架空映画I").workState, "finished");
  assert.equal(byTitle(data, "架空映画L").workState, null);
});

test("期・編・巻：「2026年秋」だけクールへ。紛らわしいものは期・編・巻に入れて一覧へ", () => {
  const { data, report } = migrate();
  const a = byTitle(data, "架空アニメA");
  assert.deepEqual(a.cours, [{ year: 2026, season: "fall", kind: "original" }]);
  assert.equal(a.partLabel, "");
  assert.equal(byTitle(data, "架空アニメB").partLabel, "第2期");
  assert.equal(byTitle(data, "架空小説G").partLabel, "上");
  const c = byTitle(data, "架空アニメC");
  assert.equal(c.partLabel, "2026秋クール");
  assert.deepEqual(c.cours, []);
  assert.ok(report.manual.some((m) => m.title === "架空アニメC"));
  assert.equal(report.cours, 1);
  assert.equal(report.partLabels, 3);
});

test("周回数：位置が戻った回数＋1。並びが決められないときは1にして一覧へ", () => {
  const { data, report } = migrate();
  assert.equal(byTitle(data, "架空アニメB").rounds, 2);
  assert.equal(byTitle(data, "架空アニメA").rounds, 1);
  assert.equal(byTitle(data, "架空アニメK").rounds, 1);
  assert.ok(report.manual.some((m) => m.title === "架空アニメK" && m.reason.includes("周回数")));
  assert.equal(report.rounds2plus, 1);
});

test("視聴手段：場所の文字から決め、場所はそのまま残す", () => {
  const { data, report } = migrate();
  const logOf = (workTitle: string) => data.logs.filter((l) => l.workId === byTitle(data, workTitle).id);
  assert.equal(logOf("架空アニメA")[0].via, "broadcast");
  assert.equal(logOf("架空アニメA")[0].place, "テレビ");
  assert.equal(logOf("架空アニメB")[0].via, "streaming");
  assert.equal(logOf("架空LIVE映像H")[0].via, "disc");
  assert.equal(logOf("架空映画I")[0].via, "venue");
  assert.equal(logOf("架空イベントJ")[0].via, "venue");
  assert.equal(logOf("架空イベントJ")[0].place, "架空会場");
  assert.equal(logOf("架空小説G")[0].via, null);
  assert.equal(logOf("架空アニメK")[0].via, null);
  assert.deepEqual(report.via, { broadcast: 3, rerun: 0, streaming: 15, disc: 1, recording: 0, venue: 2 });
  assert.equal(viaFromPlace("映画館", "movie"), "venue");
  assert.equal(viaFromPlace("家", "movie"), null);
  assert.equal(viaFromPlace("家", "live"), "venue");
});

test("購入：所持・購入予定・読む見る手段。両方当てはまれば所持にして一覧へ", () => {
  const { data, report } = migrate();
  const d = byTitle(data, "架空マンガD");
  assert.equal(d.purchase.stage, "owned");
  assert.deepEqual(d.owned?.ranges, [{ from: 1, to: 3, medium: "paper", store: null }]);
  assert.equal(d.purchase.format, "paper");
  assert.equal(d.memo, "全巻購入予定");
  assert.ok(report.manual.some((m) => m.title === "架空マンガD"));
  const e = byTitle(data, "架空マンガE");
  // v0.17.0 以降は、版1から読んでも 電子・ジャンプ＋ になる
  assert.equal(e.access, "digital");
  assert.equal(e.accessStore, "jump_plus");
  assert.equal(e.purchase.stage, "none");
  assert.equal(byTitle(data, "架空マンガF").purchase.stage, "planned");
  assert.equal(byTitle(data, "架空マンガF").memo, "購入予定");
  assert.deepEqual(byTitle(data, "架空小説G").purchase, { stage: "owned", format: "bunko", store: null });
  assert.deepEqual(byTitle(data, "架空LIVE映像H").purchase, { stage: "owned", format: "bluray", store: null });
  const j = byTitle(data, "架空イベントJ");
  assert.equal(j.access, "streaming");
  assert.equal(j.purchase.stage, "none");
  assert.equal(byTitle(data, "架空マンガM").owned?.ranges[0].medium, "digital");
  assert.equal(byTitle(data, "架空マンガM").owned?.ranges[0].store, "kindle");
  assert.deepEqual(report.purchase, { none: 9, planned: 1, reserved: 0, owned: 4 });
  assert.deepEqual(report.access, { jump_plus: 1, streaming: 1 });
  // 置き場所・買う印・親作品・人物は残る
  assert.equal(d.owned?.place, "home");
  assert.equal(byTitle(data, "架空マンガM").buying, true);
  assert.equal(byTitle(data, "架空マンガM").franchiseId, "f1");
  assert.deepEqual(byTitle(data, "架空マンガM").personIds, ["p1"]);
});

test("結果の文字（画面・スクリプトで使う）に、件数と判断できなかった一覧が入る", () => {
  const lines = describeMigration(migrate().report);
  assert.ok(lines[0].includes("作品 14→14"));
  assert.ok(lines.some((l) => l.includes("自動で判断できなかった作品：3件")));
  assert.ok(lines.some((l) => l.includes("架空アニメC")));
});

test("版1のバックアップを読み込むと、移し替えてから取り込む。版2はそのまま読める", () => {
  const v1 = parseBackup(JSON.stringify(legacy));
  assert.ok(v1.ok);
  if (!v1.ok) return;
  assert.ok(v1.migration);
  assert.equal(v1.data.works.length, 14);
  assert.equal(byTitle(v1.data, "架空アニメA").workState, "ongoing");
  assert.equal(v1.data.logs[0].via, "broadcast");
  // 書き出すと版3になり、そのまま読み戻せる（移し替えは起きない）
  const out = buildBackup(v1.data, "2026-11-18T00:00:00.000Z");
  assert.equal(out.version, 3);
  const v2 = parseBackup(JSON.stringify(out));
  assert.ok(v2.ok);
  if (!v2.ok) return;
  assert.equal(v2.migration, null);
  assert.deepEqual(v2.data.works, v1.data.works);
  assert.deepEqual(v2.data.logs, v1.data.logs);
  // 版4以降・形が崩れた版3は読まない
  assert.equal(parseBackup(JSON.stringify({ ...out, version: 4 })).ok, false);
  const broken = JSON.parse(JSON.stringify(out));
  delete broken.works[0].workState;
  assert.equal(parseBackup(JSON.stringify(broken)).ok, false);
});

test("すでに版2の作品が混ざっていても落とさず、件数は合う", () => {
  const v1 = parseBackup(JSON.stringify(legacy));
  assert.ok(v1.ok);
  if (!v1.ok) return;
  const mixed: LegacyData = { franchises: [], people: [], logs: [], works: [legacy.works[0], v1.data.works[1]] };
  const r = migrateV1ToV2(mixed);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.works.length, 2);
});
