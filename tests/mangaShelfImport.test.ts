import { test } from "node:test";
import assert from "node:assert/strict";
import { mangaShelfWorkId, parseMangaShelfBackup } from "../src/mangaShelfImport.js";

const NOW = "2026-10-31T03:00:00.000Z";

// 架空の作品（本人のデータは使わない）
const backup = {
  version: 2,
  exportedAt: NOW,
  series: [
    {
      id: "s1", title: "架空の完結マンガ", kana: "かくうのかんけつまんが", editionLabel: "新装版", publicationStatus: "completed", totalVolumes: 10,
      readProgressKnown: true, readUpTo: 10, finishedAt: "2026-07-01", everCompleted: true, ownershipKnown: true, ownedMedium: "paper",
      paperLocation: "parents_home", ownedRanges: [{ from: 1, to: 10 }], planned: false, anilistId: 123, legacyNote: "旧メモ", memo: "メモ",
      createdAt: "2026-07-18T00:00:00+09:00", updatedAt: "2026-07-19T00:00:00+09:00",
    },
    {
      id: "s2", title: "架空の連載マンガ", publicationStatus: "ongoing", totalVolumes: 5, readProgressKnown: true, readUpTo: 5,
      ownedMedium: "jump_plus", ownedRanges: [], planned: false, anilistId: null,
    },
    { id: "s3", title: "読みたいマンガ", publicationStatus: "unknown", totalVolumes: null, readProgressKnown: false, readUpTo: null, planned: true },
  ],
};

test("マンガ棚の項目を消さずに移し、記録は作らない", () => {
  const r = parseMangaShelfBackup(JSON.stringify(backup), NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  const [a, b, c] = r.works;
  assert.equal(a.id, mangaShelfWorkId("s1"));
  assert.equal(a.status, "done");
  assert.equal(a.edition, "新装版");
  assert.equal(a.kana, "かくうのかんけつまんが");
  assert.deepEqual(a.owned, { known: true, ranges: [{ from: 1, to: 10 }], medium: "paper", place: "parents_home" });
  assert.equal(a.externalIds.anilist, 123);
  assert.equal(a.legacyNote, "旧メモ");
  assert.equal(a.memo, "メモ");
  // 連載中は最新巻まで読んでも続きに残す
  assert.equal(b.status, "active");
  assert.equal(b.finished, false);
  assert.equal(b.owned?.medium, "jump_plus");
  assert.equal(c.status, "wish");
  assert.equal(c.progress, null);
});

test("マンガ棚のバックアップでないものは読まない", () => {
  assert.equal(parseMangaShelfBackup(JSON.stringify({ items: [] }), NOW).ok, false);
});
