// 人物一覧と人物の画像（v0.18.0）。架空データだけを使う
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, parseBackup, planUpdate } from "../src/backup.js";
import { normalizePerson } from "../src/dataOps.js";
import { peopleWithCounts } from "../src/linkLogic.js";
import { emptyWork } from "../src/workFactory.js";
import type { DataSet, Person } from "../src/types.js";

const NOW = "2026-11-19T03:00:00.000Z";
const person = (id: string, name: string, patch: Partial<Person> = {}): Person => ({ id, createdAt: NOW, updatedAt: NOW, deletedAt: null, name, kana: "", memo: "", ...patch });

test("人物一覧：作品の多い順 → 名前順。消した作品・消した人物は数えない。作品0件の人も最後に出す", () => {
  const data: DataSet = {
    franchises: [], logs: [],
    people: [person("a", "架空バンドA"), person("b", "架空歌手B"), person("c", "架空作家C"), person("d", "消した人", { deletedAt: NOW })],
    works: [
      { ...emptyWork("video", NOW), id: "w1", personIds: ["b", "a"] },
      { ...emptyWork("live", NOW), id: "w2", personIds: ["b", "b"] },
      { ...emptyWork("live", NOW), id: "w3", personIds: ["a"], deletedAt: NOW },
      { ...emptyWork("live", NOW), id: "w4", personIds: ["d"] },
    ],
  };
  assert.deepEqual(peopleWithCounts(data).map((x) => `${x.person.id}:${x.works}`), ["b:2", "a:1", "c:0"]);
});

test("人物の画像のURL：古いデータ（項目なし）は null、空白だけも null。バックアップの更新で画像だけ入れ替えられる", () => {
  assert.equal(normalizePerson(person("a", "A")).imageUrl, null);
  assert.equal(normalizePerson(person("a", "A", { imageUrl: "  " })).imageUrl, null);
  assert.equal(normalizePerson(person("a", "A", { imageUrl: " https://example.com/a.jpg " })).imageUrl, "https://example.com/a.jpg");
  const cur: DataSet = { franchises: [], works: [], logs: [], people: [person("a", "A")] };
  const incoming = parseBackup(JSON.stringify(buildBackup({ ...cur, people: [person("a", "A", { imageUrl: "https://example.com/a.jpg", updatedAt: "2026-11-20T00:00:00.000Z" })] }, NOW)));
  assert.ok(incoming.ok);
  if (!incoming.ok) return;
  const plan = planUpdate(cur, incoming.data);
  assert.equal(plan.changes.people[0].imageUrl, "https://example.com/a.jpg");
});
