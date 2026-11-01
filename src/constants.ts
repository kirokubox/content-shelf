import type { Medium, ProgressKind, WorkStatus } from "./types.js";

/** 設定の「このアプリについて」に出す版。package.json の version とそろえる */
export const APP_VERSION = "0.8.0";

export const DB_NAME = "content-shelf";
export const DB_VERSION = 2;
/** 版2で people を足した */
export const STORES = ["franchises", "works", "logs", "people"] as const;

export const MEDIUM_LABEL: Record<Medium, string> = {
  anime: "アニメ",
  drama: "ドラマ",
  magazine: "週刊誌",
  manga: "マンガ",
  novel: "小説",
  movie: "映画",
  game: "ゲーム",
  live: "LIVE・フェス",
  video: "LIVE映像",
  other: "その他",
};

export const PROGRESS_KIND: Record<Medium, ProgressKind> = {
  anime: "episode",
  drama: "episode",
  magazine: "issue",
  manga: "volume",
  novel: "none",
  movie: "none",
  game: "none",
  live: "none",
  video: "none",
  other: "none",
};

/** 単位（〜話、〜巻、〜号） */
export const UNIT_LABEL: Record<ProgressKind, string> = {
  episode: "話",
  volume: "巻",
  issue: "号",
  none: "",
};


export const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

/** ＋1を長押しとみなす時間（ミリ秒） */
export const LONG_PRESS_MS = 500;

/** 単発ものの「済んだ」の言い方（映画＝見た、小説＝読んだ、LIVE＝行った） */
export function doneWord(medium: Medium): string {
  if (medium === "movie") return "見た";
  if (medium === "novel") return "読んだ";
  if (medium === "live") return "行った";
  if (medium === "video") return "見た";
  if (medium === "game") return "遊んだ";
  return "見た・読んだ";
}

/** 単発ものの「これから」の言い方 */
export function wishWord(medium: Medium): string {
  if (medium === "movie") return "見たい";
  if (medium === "novel") return "読みたい";
  if (medium === "live") return "行きたい";
  if (medium === "video") return "見たい";
  if (medium === "game") return "遊びたい";
  return "見たい・読みたい";
}

/** 読むもの（マンガ・小説・週刊誌）か */
export function isReading(medium: Medium): boolean {
  return medium === "manga" || medium === "novel" || medium === "magazine";
}

/** 状態の名前（名詞）。種類に合わせる（2026-11-01 本人「積読みたいな名詞がいい」） */
export function statusWord(medium: Medium, status: WorkStatus): string {
  if (status === "paused") return "中断";
  if (medium === "live") return status === "wish" ? "参戦予定" : "参戦済み";
  if (medium === "game") return { active: "プレイ中", wish: "積みゲー", done: "プレイ済み" }[status];
  if (isReading(medium)) return { active: "読書中", wish: "積読", done: "読了" }[status];
  return { active: "視聴中", wish: "視聴予定", done: "視聴済み" }[status];
}

/** 続きを数えないが「途中・中断」を持つ種類（ゲーム） */
export function hasOngoingStatus(medium: Medium): boolean {
  return medium === "game";
}

/** 人物の欄の名前（映画・ドラマ＝出演、マンガ・小説＝作者） */
export function peopleLabel(medium: Medium): string {
  if (medium === "live") return "出演者";
  if (medium === "manga" || medium === "novel") return "作者";
  if (medium === "movie" || medium === "drama" || medium === "video") return "出演";
  if (medium === "game") return "開発・メーカー";
  return "人物";
}

/** AniListの情報を自動で確かめる間隔（12時間） */
export const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

export const CLEAR_LABEL = { clear: "クリア", complete: "やりこみ", partway: "途中まで" } as const;
export const OWN_FORMAT_LABEL = { package: "パッケージ", download: "ダウンロード", tankobon: "単行本", bunko: "文庫", ebook: "電子" } as const;
/** ハードの候補（自由入力もできる） */
export const PLATFORMS = ["Switch", "スマホ", "PS5", "PS4", "PC", "3DS", "DS", "Wii", "PS2", "ゲームボーイ"];

export const VIDEO_OWNED_LABEL = { dvd: "DVD", bluray: "Blu-ray", digital: "配信・デジタル" } as const;
