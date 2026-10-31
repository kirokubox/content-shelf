import { test } from "node:test";
import assert from "node:assert/strict";
import { airedFromAnilist, applyAnilist, mapMedia } from "../src/anilist.js";
import { withAutoStatus } from "../src/progressLogic.js";
import { emptyWork } from "../src/workFactory.js";

const NOW = "2026-10-31T03:00:00.000Z";

const airing = mapMedia({
  id: 1, type: "ANIME", title: { native: "架空アニメ", romaji: "Kakuu" }, status: "RELEASING", format: "TV",
  episodes: 12, coverImage: { large: "https://example.invalid/c.jpg" }, nextAiringEpisode: { episode: 6 }, season: "FALL", seasonYear: 2026,
})!;

test("放送中は「次の話−1」が放送済み、完結なら全話数", () => {
  assert.equal(airedFromAnilist(airing), 5);
  assert.equal(airedFromAnilist({ ...airing, nextEpisode: null, status: "FINISHED" }), 12);
  assert.equal(airedFromAnilist({ ...airing, nextEpisode: null, status: "NOT_YET_RELEASED" }), null);
});

test("情報の反映は表紙・全話数・完結・放送済みだけで、見た位置は変えない", () => {
  const w = { ...emptyWork("anime", NOW), title: "自分で付けた題名", progress: 3 };
  const next = applyAnilist(w, airing, NOW);
  assert.equal(next.title, "自分で付けた題名");
  assert.equal(next.progress, 3);
  assert.equal(next.total, 12);
  assert.equal(next.finished, false);
  assert.equal(next.latestKnown, 5);
  assert.equal(next.coverUrl, "https://example.invalid/c.jpg");
  assert.equal(next.externalIds.anilist, 1);
});

test("放送日で数えている作品は、放送済みの数を上書きしない", () => {
  const w = { ...emptyWork("anime", NOW), title: "a", schedule: { firstDate: "2026-10-04", firstNumber: 1, skipDates: [] }, latestKnown: null };
  assert.equal(applyAnilist(w, airing, NOW).latestKnown, null);
});

test("完結が分かり、全話見ていれば記録へ移る（見ていなければ移らない）", () => {
  const finished = { ...airing, status: "FINISHED", nextEpisode: null };
  const all = withAutoStatus(applyAnilist({ ...emptyWork("anime", NOW), title: "a", progress: 12 }, finished, NOW), NOW);
  assert.equal(all.status, "done");
  const half = withAutoStatus(applyAnilist({ ...emptyWork("anime", NOW), title: "a", progress: 6 }, finished, NOW), NOW);
  assert.equal(half.status, "active");
});

test("形の崩れた応答は捨てる", () => {
  assert.equal(mapMedia({ id: "x" }), null);
  assert.equal(mapMedia({ id: 2, title: {} }), null);
});
