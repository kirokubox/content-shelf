import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIUM_LABEL, isStageEvent, mediumTag, workPeopleLabel, workStatusWord } from "../src/constants.js";
import { normalizeWork } from "../src/dataOps.js";
import { emptyWork } from "../src/workFactory.js";
import type { Work } from "../src/types.js";

const NOW = "2026-11-03T03:00:00.000Z";

test("種類の名前はイベント・映像作品", () => {
  assert.equal(MEDIUM_LABEL.live, "イベント");
  assert.equal(MEDIUM_LABEL.video, "映像作品");
});

test("新しいイベントはLIVEで始まる。ほかの種類は区分なし", () => {
  assert.equal(emptyWork("live", NOW).eventKind, "live");
  assert.equal(emptyWork("movie", NOW).eventKind, null);
});

test("前の版のデータは区分なしで読み、LIVEとして扱う", () => {
  const old = { ...emptyWork("live", NOW) } as Partial<Work>;
  delete old.eventKind;
  const w = normalizeWork(old as Work);
  assert.equal(w.eventKind, null);
  assert.equal(isStageEvent(w), true);
  assert.equal(mediumTag(w), "イベント");
  assert.equal(workStatusWord(w, "done"), "参戦済み");
  // イベント以外に区分が入っていても外す
  assert.equal(normalizeWork({ ...emptyWork("movie", NOW), eventKind: "food" }).eventKind, null);
});

test("区分で札・状態・人物の欄の名前が変わる", () => {
  const food = { ...emptyWork("live", NOW), eventKind: "food" as const };
  assert.equal(mediumTag(food), "グルメ");
  assert.equal(isStageEvent(food), false);
  assert.equal(workStatusWord(food, "done"), "行った");
  assert.equal(workStatusWord(food, "wish"), "行く予定");
  assert.equal(workPeopleLabel(food), "お店・出店");
  const ex = { ...emptyWork("live", NOW), eventKind: "exhibit" as const };
  assert.equal(workPeopleLabel(ex), "作家・出展");
  const fes = { ...emptyWork("live", NOW), eventKind: "fes" as const };
  assert.equal(mediumTag(fes), "フェス");
  assert.equal(workStatusWord(fes, "wish"), "参戦予定");
  assert.equal(workPeopleLabel(fes), "出演者");
});
