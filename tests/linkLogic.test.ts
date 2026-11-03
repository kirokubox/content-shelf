import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBackup } from "../src/backup.js";
import { resolveFranchise, resolvePeople, worksOfPerson } from "../src/linkLogic.js";
import { buildMarkdown } from "../src/markdownExport.js";
import { emptyWork, newLog } from "../src/workFactory.js";
import type { DataSet } from "../src/types.js";

const NOW = "2026-10-31T03:00:00.000Z";

test("人物は名前で探し、無い人だけ作る（表記ゆれのカタカナ・ひらがなは同じ人）", () => {
  const first = resolvePeople([], ["架空バンド", "架空シンガー", "架空バンド"], NOW);
  assert.equal(first.ids.length, 2);
  assert.equal(first.created.length, 2);
  const again = resolvePeople(first.created, ["架空ばんど", "新しい人"], NOW);
  assert.equal(again.ids[0], first.ids[0]);
  assert.equal(again.created.length, 1);
});

test("親作品も名前で探し、空なら付けない", () => {
  assert.deepEqual(resolveFranchise([], "  ", NOW), { id: null, created: [] });
  const a = resolveFranchise([], "架空シリーズ", NOW);
  const b = resolveFranchise(a.created, "架空シリーズ", NOW);
  assert.equal(b.id, a.id);
  assert.equal(b.created.length, 0);
});

test("フェス1件に複数の出演者を付け、各出演者から同じ公演が見える", () => {
  const people = resolvePeople([], ["出演者A", "出演者B"], NOW);
  const fes = { ...emptyWork("live", NOW), title: "架空フェス", personIds: people.ids };
  const data: DataSet = { franchises: [], works: [fes], logs: [], people: people.created };
  assert.deepEqual(worksOfPerson(data, people.ids[0]).map((w) => w.id), [fes.id]);
  assert.deepEqual(worksOfPerson(data, people.ids[1]).map((w) => w.id), [fes.id]);
});

test("段階2までの古いバックアップ（人物なし）も読める", () => {
  const w = emptyWork("movie", NOW) as unknown as Record<string, unknown>;
  delete w.personIds;
  delete w.setlist;
  const r = parseBackup(JSON.stringify({ app: "content-shelf", version: 1, exportedAt: NOW, franchises: [], works: [{ ...w, title: "映画" }], logs: [] }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.data.people, []);
  assert.deepEqual(r.data.works[0].personIds, []);
  assert.equal(r.data.works[0].setlist, "");
});

test("テキストの書き出しに、感想・人物・セットリストが入り、期間で絞れる", () => {
  const people = resolvePeople([], ["出演者A"], NOW);
  const live = { ...emptyWork("live", NOW), title: "架空LIVE", personIds: people.ids, setlist: "曲1\n曲2" };
  const data: DataSet = {
    franchises: [], people: people.created, works: [live],
    logs: [newLog({ workId: live.id, kind: "view", date: "2026-10-11", note: "最高だった", rating: 5 }, NOW)],
  };
  const md = buildMarkdown(data, NOW);
  assert.match(md, /## イベント（1）/);
  assert.match(md, /人物：出演者A/);
  assert.match(md, /セットリスト：曲1 \/ 曲2/);
  assert.match(md, /最高だった/);
  assert.doesNotMatch(buildMarkdown(data, NOW, { from: "2026-09-01", to: "2026-09-30" }), /架空LIVE/);
});
