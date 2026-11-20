import { test } from "node:test";
import assert from "node:assert/strict";
import { airSlotFromUnix, compareAirSlot, formatAirSlot, normAirSlot, parseSlotTime } from "../src/airSlot.js";
import { applyAnilist } from "../src/anilist.js";
import type { AnilistMedia } from "../src/anilist.js";
import { purchaseFormatChoices } from "../src/constants.js";
import { normalizeWork } from "../src/dataOps.js";
import { countdownText } from "../src/expectLogic.js";
import { discIdForLive, discsOfLive, splitLiveDiscs } from "../src/liveDisc.js";
import { nextHidden } from "../src/scrollLogic.js";
import { choosePref, sortWorks } from "../src/sortLogic.js";
import { emptyWork } from "../src/workFactory.js";
import type { Work } from "../src/types.js";

const NOW = "2026-11-20T03:00:00.000Z";
const TODAY = "2026-11-20";

test("あと何日：10日までは日、8週間までは週、その先は月、12か月からは年", () => {
  const day = (date: string) => countdownText({ date, precision: "day" }, TODAY);
  assert.equal(day("2026-11-20"), "今日");
  assert.equal(day("2026-11-21"), "明日");
  assert.equal(day("2026-11-30"), "あと10日");
  assert.equal(day("2026-12-01"), "あと2週間");
  assert.equal(day("2027-01-15"), "あと8週間");
  assert.equal(day("2027-01-19"), "あと2か月");
  assert.equal(day("2027-11-20"), "あと1年");
  assert.equal(day("2028-01-20"), "あと1年2か月");
  const month = (date: string) => countdownText({ date, precision: "month" }, TODAY);
  assert.equal(month("2026-11-01"), "今月");
  assert.equal(month("2026-12-01"), "来月");
  assert.equal(month("2027-03-01"), "あと4か月");
  const year = (date: string) => countdownText({ date, precision: "year" }, TODAY);
  assert.equal(year("2026-01-01"), "今年");
  assert.equal(year("2027-01-01"), "来年");
  assert.equal(year("2029-01-01"), "あと3年");
});

test("放送枠：日本時間の深夜0〜4時台は前日の24〜28時にする", () => {
  // 2026-11-21（土）16:30 UTC＝日曜 1:30 JST → 土 25:30
  const late = airSlotFromUnix(Date.UTC(2026, 10, 21, 16, 30) / 1000);
  assert.deepEqual(late, { weekday: 6, minutes: 25 * 60 + 30, source: "anilist" });
  assert.equal(formatAirSlot(late), "土 25:30");
  // 土曜 23:00 JST はそのまま
  assert.equal(formatAirSlot(airSlotFromUnix(Date.UTC(2026, 10, 21, 14, 0) / 1000)), "土 23:00");
  // 日曜 5:00 JST は日曜の朝
  assert.equal(formatAirSlot(airSlotFromUnix(Date.UTC(2026, 10, 21, 20, 0) / 1000)), "日 5:00");
  assert.equal(parseSlotTime("２５：３０"), 1530);
  assert.equal(parseSlotTime("29:00"), null);
  assert.equal(parseSlotTime("12:75"), null);
  // 0:00〜4:59 のまま入っていたら前日へ寄せる。壊れた値は null
  assert.deepEqual(normAirSlot({ weekday: 0, minutes: 90, source: "manual" }), { weekday: 6, minutes: 1530, source: "manual" });
  assert.equal(normAirSlot({ weekday: 7, minutes: 600 }), null);
  // 月曜始まり
  assert.ok(compareAirSlot({ weekday: 1, minutes: 1500, source: "manual" }, { weekday: 0, minutes: 600, source: "manual" }) < 0);
});

test("AniList：放送枠は自動で入れた枠だけ上書きし、手で直した枠は変えない", () => {
  const m: AnilistMedia = { id: 1, type: "ANIME", title: "架空", romaji: "", status: "RELEASING", format: "TV", episodes: 12, volumes: null, cover: null, nextEpisode: 3, nextAiringAt: Date.UTC(2026, 10, 21, 16, 30) / 1000, season: "FALL", seasonYear: 2026, startDate: null };
  const base = { ...emptyWork("anime", NOW), title: "a" };
  assert.equal(formatAirSlot(applyAnilist(base, m, NOW).airSlot!), "土 25:30");
  const manual = { ...base, airSlot: { weekday: 3, minutes: 1380, source: "manual" as const } };
  assert.deepEqual(applyAnilist(manual, m, NOW).airSlot, manual.airSlot);
  const auto = { ...base, airSlot: { weekday: 3, minutes: 1380, source: "anilist" as const } };
  assert.equal(applyAnilist(auto, m, NOW).airSlot!.weekday, 6);
  assert.equal(applyAnilist(base, { ...m, nextAiringAt: null }, NOW).airSlot, null);
});

test("放送枠で並べる：月曜から、枠の無い作品は最後に題名順", () => {
  const w = (id: string, slot: Work["airSlot"]): Work => ({ ...emptyWork("anime", NOW), id, title: id, airSlot: slot });
  const works = [w("none", null), w("sun", { weekday: 0, minutes: 1020, source: "anilist" }), w("sat-late", { weekday: 6, minutes: 1530, source: "anilist" }), w("mon", { weekday: 1, minutes: 1440, source: "manual" })];
  assert.deepEqual(sortWorks(works, choosePref("airslot"), {}).map((x) => x.id), ["mon", "sat-late", "sun", "none"]);
});

test("LIVEの購入情報を映像作品へ移す：1回だけ・同じidで二重にしない", () => {
  const live: Work = { ...emptyWork("live", NOW), id: "L1", title: "架空ツアー", personIds: ["p1"], coverUrl: "https://example.com/a.jpg", purchase: { stage: "owned", format: "bluray", store: null } };
  const other: Work = { ...emptyWork("live", NOW), id: "L2", title: "架空フェス" };
  const first = splitLiveDiscs([live, other], NOW);
  assert.equal(first.created.length, 1);
  const disc = first.created[0];
  assert.equal(disc.id, discIdForLive("L1"));
  assert.equal(disc.medium, "video");
  assert.deepEqual(disc.purchase, { stage: "owned", format: "bluray", store: null });
  assert.deepEqual(disc.relatedLiveIds, ["L1"]);
  assert.deepEqual(disc.personIds, ["p1"]);
  assert.equal(disc.status, "wish");
  assert.deepEqual(first.updated.map((w) => [w.id, w.purchase.stage, w.purchase.format]), [["L1", "none", null]]);
  // 移したあとはもう何もしない
  const after = [first.updated[0], other, disc];
  assert.deepEqual(splitLiveDiscs(after, NOW), { created: [], updated: [] });
  // 別の端末で円盤だけ先に届いていても、同じidの円盤は作らない（LIVEの購入情報は外す）
  const again = splitLiveDiscs([live, disc], NOW);
  assert.equal(again.created.length, 0);
  assert.equal(again.updated.length, 1);
  assert.deepEqual(discsOfLive(after, "L1").map((w) => w.id), [disc.id]);
  assert.deepEqual(purchaseFormatChoices("live"), []);
  assert.deepEqual(purchaseFormatChoices("video"), ["bluray", "dvd"]);
});

test("読み込み時の補い：関連LIVEは映像作品だけ、古いデータは空・null", () => {
  const raw = { ...emptyWork("anime", NOW) } as Record<string, unknown>;
  delete raw.airSlot;
  delete raw.relatedLiveIds;
  const w = normalizeWork(raw as unknown as Work);
  assert.equal(w.airSlot, null);
  assert.deepEqual(w.relatedLiveIds, []);
  const v = normalizeWork({ ...emptyWork("video", NOW), relatedLiveIds: ["a", "a", "", "b"] });
  assert.deepEqual(v.relatedLiveIds, ["a", "b"]);
  assert.deepEqual(normalizeWork({ ...emptyWork("movie", NOW), relatedLiveIds: ["a"] }).relatedLiveIds, []);
});

test("スクロールで切り替えを隠す：下へ動いたら隠し、上へ動いたら出す。先頭近くでは常に出す", () => {
  assert.equal(nextHidden(false, 100, 140), true);
  assert.equal(nextHidden(true, 400, 380), false);
  assert.equal(nextHidden(true, 400, 396), true);
  assert.equal(nextHidden(true, 100, 30), false);
});
