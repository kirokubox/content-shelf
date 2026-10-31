import type { Medium, ProgressKind, WorkStatus } from "./types.js";

/** 設定の「このアプリについて」に出す版。package.json の version とそろえる */
export const APP_VERSION = "0.2.0";

export const DB_NAME = "content-shelf";
export const DB_VERSION = 1;
export const STORES = ["franchises", "works", "logs"] as const;

export const MEDIUM_LABEL: Record<Medium, string> = {
  anime: "アニメ",
  drama: "ドラマ",
  magazine: "週刊誌",
  manga: "マンガ",
  novel: "小説",
  movie: "映画",
  live: "LIVE・フェス",
  other: "その他",
};

export const PROGRESS_KIND: Record<Medium, ProgressKind> = {
  anime: "episode",
  drama: "episode",
  magazine: "issue",
  manga: "volume",
  novel: "none",
  movie: "none",
  live: "none",
  other: "none",
};

/** 単位（〜話、〜巻、〜号） */
export const UNIT_LABEL: Record<ProgressKind, string> = {
  episode: "話",
  volume: "巻",
  issue: "号",
  none: "",
};

export const STATUS_LABEL: Record<WorkStatus, string> = {
  active: "進行中",
  paused: "休止中",
  wish: "見たい・読みたい",
  done: "記録",
};

export const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

/** ＋1を長押しとみなす時間（ミリ秒） */
export const LONG_PRESS_MS = 500;
