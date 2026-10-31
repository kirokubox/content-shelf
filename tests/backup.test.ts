import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, parseBackup, planMerge } from "../src/backup.js";
import { emptyWork, newLog } from "../src/workFactory.js";
import type { DataSet } from "../src/types.js";

const NOW = "2026-10-31T03:00:00.000Z";

function sample(): DataSet {
  const movie = { ...emptyWork("movie", NOW), title: "映画" };
  return { franchises: [], works: [movie], logs: [newLog({ workId: movie.id, kind: "view", date: "2026-10-28", note: "泣いた" }, NOW), newLog({ workId: movie.id, kind: "view", date: "2026-10-30" }, NOW)] };
}

test("保存したバックアップをそのまま読み戻せる", () => {
  const data = sample();
  const r = parseBackup(JSON.stringify(buildBackup(data, NOW)));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.works.length, 1);
  assert.equal(r.data.logs.length, 2);
});

test("ほかのアプリのファイルや壊れた形は読まない", () => {
  assert.equal(parseBackup("{").ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: "kakeibo", version: 1 })).ok, false);
  const broken = buildBackup(sample(), NOW);
  (broken.logs[0] as unknown as { date: string }).date = "10/28";
  assert.equal(parseBackup(JSON.stringify(broken)).ok, false);
});

test("追加は同じidを上書きせず、新しいものだけ足す", () => {
  const cur = sample();
  const incoming = sample();
  incoming.works.push(...cur.works); // 同じ作品が入っている
  const plan = planMerge(cur, incoming);
  assert.equal(plan.add.works.length, 1);
  assert.equal(plan.add.logs.length, 2);
  assert.equal(plan.counts[0].skipped, 1);
});
