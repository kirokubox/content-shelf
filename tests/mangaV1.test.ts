import test from "node:test";
import assert from "node:assert/strict";
import { convertMangaAccess } from "../src/mangaAccess.js";
import { continueGroup, ownedVolumesText } from "../src/progressLogic.js";
import { defaultVia } from "../src/courLogic.js";
import { viaChoicesOf } from "../src/constants.js";
import { emptyWork } from "../src/workFactory.js";
import type { Work } from "../src/types.js";

const NOW = "2026-11-23T00:00:00.000Z";
const manga = (patch: Partial<Work> = {}): Work => ({ ...emptyWork("manga", NOW), title: "架空マンガ", ...patch });

test("マンガの読む手段：紙・電子は外し、電子・ジャンプ＋は週刊誌。ほかの種類と、今の選択肢はそのまま", () => {
  const works = [
    manga({ id: "a", access: "digital", accessStore: "jump_plus" }),
    manga({ id: "b", access: "paper" }),
    manga({ id: "c", access: "manga_cafe" }),
    { ...emptyWork("anime", NOW), id: "d", access: "streaming" as const },
  ];
  const out = convertMangaAccess(works, NOW);
  assert.deepEqual(out.map((w) => [w.id, w.access, w.accessStore]), [["a", "weekly", null], ["b", null, null]]);
  assert.equal(convertMangaAccess(out, NOW).length, 0);
});

test("週刊誌で読んでいるマンガは、完結前なら続きの「現在」、完結したら「途中」", () => {
  assert.equal(continueGroup(manga({ status: "active", access: "weekly", workState: "ongoing" })), "current");
  assert.equal(continueGroup(manga({ status: "active", access: "weekly", workState: "finished" })), "partway");
  assert.equal(continueGroup(manga({ status: "active", access: null, workState: "ongoing" })), "partway");
});

test("マンガの記録の読む手段：前回 → 作品の読む手段 → 持っていれば所持", () => {
  const today = "2026-11-23";
  assert.equal(defaultVia(manga({ id: "x", access: "weekly" }), [], today), "weekly");
  assert.equal(defaultVia(manga({ id: "x", access: null, purchase: { stage: "owned", format: "paper", store: null } }), [], today), "own_book");
  assert.equal(defaultVia(manga({ id: "x", access: null }), [], today), null);
  assert.deepEqual(viaChoicesOf("manga"), ["weekly", "own_book", "manga_cafe", "rental"]);
  assert.equal(viaChoicesOf("anime").includes("weekly" as never), false);
});

test("完結したマンガの持っている巻の文字", () => {
  const owned = (ranges: Array<{ from: number; to: number }>) => ({ known: true, ranges, reserved: [], place: null, volumeDates: [] });
  assert.equal(ownedVolumesText(manga({ workState: "finished", total: 10, owned: owned([{ from: 1, to: 10 }]) })), "全巻持ってる");
  assert.equal(ownedVolumesText(manga({ workState: "finished", total: 20, owned: owned([{ from: 1, to: 5 }, { from: 8, to: 12 }]) })), "10/20巻持ってる");
  assert.equal(ownedVolumesText(manga({ workState: "finished", total: null, owned: owned([{ from: 1, to: 3 }]) })), "3巻持ってる");
  assert.equal(ownedVolumesText(manga({ workState: "finished", owned: owned([]) })), "持ってない");
  assert.equal(ownedVolumesText(manga({ workState: "ongoing", owned: owned([{ from: 1, to: 3 }]) })), "");
});

import { authorsOf, fuzzyOf } from "../src/anilist.js";
import { mergeMangaInfo, needsMangaInfo } from "../src/mangaInfo.js";
import { effectivePref, sortOptionsFor, sortWorks } from "../src/sortLogic.js";
import type { AnilistMedia } from "../src/anilist.js";
import type { Person } from "../src/types.js";

test("AniList の終了日（年だけ・年月だけ）と作者（原作・作画だけ、日本語の名前）", () => {
  assert.deepEqual(fuzzyOf({ year: 2020, month: 5, day: 18 }), { date: "2020-05-18", precision: "day" });
  assert.deepEqual(fuzzyOf({ year: 2020, month: 5 }), { date: "2020-05-01", precision: "month" });
  assert.deepEqual(fuzzyOf({ year: 2020 }), { date: "2020-01-01", precision: "year" });
  assert.equal(fuzzyOf({}), null);
  assert.deepEqual(authorsOf({ edges: [
    { role: "Story & Art", node: { name: { native: "架空作者", full: "Kaku Sakusha" } } },
    { role: "Assistant", node: { name: { native: "手伝い", full: "Tetsudai" } } },
    { role: "Story", node: { name: { full: "Only Romaji" } } },
  ] }), ["架空作者", "Only Romaji"]);
});

test("マンガの作者と完結日を入れる：空のときだけ。人物は名前で探し、無ければ作る。2回目は何もしない", () => {
  const people: Person[] = [{ id: "p1", createdAt: NOW, updatedAt: NOW, deletedAt: null, name: "架空作者", kana: "", memo: "" }];
  const works = [
    manga({ id: "a", externalIds: { anilist: 1 }, workState: "finished" }),
    manga({ id: "b", externalIds: { anilist: 2 }, workState: "ongoing" }),
    manga({ id: "c", externalIds: { anilist: 3 }, personIds: ["p1"], workState: "finished", endDate: { date: "2019-01-01", precision: "year" } }),
  ];
  const media = (id: number, authors: string[], status: string): AnilistMedia => ({ id, type: "MANGA", title: "x", romaji: "", status, format: "MANGA", episodes: null, volumes: 10, cover: null, nextEpisode: null, nextAiringAt: null, season: null, seasonYear: null, startDate: null, endDate: { date: "2021-03-01", precision: "month" }, authors });
  const r = mergeMangaInfo(works, people, [media(1, ["架空作者"], "FINISHED"), media(2, ["新しい作者"], "RELEASING"), media(3, ["別の人"], "FINISHED")], NOW);
  assert.deepEqual(r.works.map((w) => [w.id, w.personIds.length, w.endDate?.date ?? null]), [["a", 1, "2021-03-01"], ["b", 1, null]]);
  assert.equal(r.works[0].personIds[0], "p1");
  assert.deepEqual(r.created.map((p) => p.name), ["新しい作者"]);
  assert.equal(needsMangaInfo(r.works[0]), false);
});

test("並び順：作者・完結/発売日は小説・マンガ・映像作品に絞ったときだけ選べ、選べないときは既定で並ぶ", () => {
  assert.equal(sortOptionsFor("continue-partway", null).includes("author"), false);
  assert.equal(sortOptionsFor("continue-partway", "novel").includes("author"), true);
  assert.equal(sortOptionsFor("purchase-owned", "anime").includes("released"), false);
  assert.deepEqual(effectivePref("continue-partway", { key: "author", dir: "asc" }, "anime"), { key: "title", dir: "asc" });
  const people = new Map<string, Person>([["p1", { id: "p1", createdAt: NOW, updatedAt: NOW, deletedAt: null, name: "い作者", kana: "", memo: "" }], ["p2", { id: "p2", createdAt: NOW, updatedAt: NOW, deletedAt: null, name: "あ作者", kana: "", memo: "" }]]);
  const ws = [
    manga({ id: "x", title: "X", personIds: ["p1"], endDate: { date: "2010-01-01", precision: "year" } }),
    manga({ id: "y", title: "Y", personIds: ["p2"], endDate: null }),
    manga({ id: "z", title: "Z", personIds: [], endDate: { date: "2005-06-01", precision: "month" } }),
  ];
  assert.deepEqual(sortWorks(ws, { key: "author", dir: "asc" }, { peopleById: people }).map((w) => w.id), ["y", "x", "z"]);
  assert.deepEqual(sortWorks(ws, { key: "released", dir: "asc" }, {}).map((w) => w.id), ["z", "x", "y"]);
  assert.deepEqual(sortWorks(ws, { key: "released", dir: "desc" }, {}).map((w) => w.id), ["x", "z", "y"]);
});
