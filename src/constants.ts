import type { Access, DigitalStore, EventKind, LogVia, Medium, ProgressKind, PurchaseFormat, PurchaseStage, RangeMedium, Work, WorkState, WorkStatus } from "./types.js";

/** 設定の「このアプリについて」に出す版。package.json の version とそろえる */
export const APP_VERSION = "0.21.1";

export const DB_NAME = "content-shelf";
export const DB_VERSION = 4;
/** 版2で people、版3で写真（photos。STORES とは別に読み書きする）、版4で移し替え用の migrations（STORES とは別。データの形の版2）を足した */
export const STORES = ["franchises", "works", "logs", "people"] as const;
/** 移し替え前のデータと移し替えの結果を置く（v0.16.0） */
export const MIGRATION_STORE = "migrations";
/** バックアップ・データの形の最新の版（版1・版2は移し替えてから使う。版3＝v0.17.0） */
export const DATA_VERSION = 3;

export const MEDIUM_LABEL: Record<Medium, string> = {
  anime: "アニメ",
  drama: "ドラマ",
  magazine: "週刊誌",
  manga: "マンガ",
  novel: "小説",
  movie: "映画",
  game: "ゲーム",
  live: "イベント",
  video: "映像作品",
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

/** 読むもの（マンガ・小説・週刊誌）か */
export function isReading(medium: Medium): boolean {
  return medium === "manga" || medium === "novel" || medium === "magazine";
}

/** イベントの区分（2026-11-03 本人：食べ物フェスや展示会も入れたい） */
export const EVENT_KIND_LABEL: Record<Exclude<EventKind, null>, string> = {
  live: "LIVE",
  fes: "フェス",
  food: "グルメ",
  exhibit: "展示",
  other: "その他",
};

/** LIVE・フェスか（区分が未設定のイベントもLIVEとして扱う）。セットリスト・映像・「参戦」はこのときだけ */
export function isStageEvent(w: Pick<Work, "medium" | "eventKind">): boolean {
  return w.medium === "live" && (w.eventKind === null || w.eventKind === "live" || w.eventKind === "fes");
}

/** 一覧の種類の札。イベントは区分を出す（例：グルメ） */
export function mediumTag(w: Pick<Work, "medium" | "eventKind">): string {
  if (w.medium === "live" && w.eventKind) return EVENT_KIND_LABEL[w.eventKind];
  return MEDIUM_LABEL[w.medium];
}

/** 作品に合わせた状態の名前（イベントは区分で変わる） */
export function workStatusWord(w: Pick<Work, "medium" | "eventKind">, status: WorkStatus): string {
  if (w.medium === "live" && !isStageEvent(w) && status !== "paused") return status === "wish" ? "行く予定" : "体験済";
  return statusWord(w.medium, status);
}

/** 作品に合わせた人物の欄の名前 */
export function workPeopleLabel(w: Pick<Work, "medium" | "eventKind">): string {
  if (w.medium === "live" && w.eventKind === "exhibit") return "作家・出展";
  if (w.medium === "live" && w.eventKind === "food") return "お店・出店";
  if (w.medium === "live" && w.eventKind === "other") return "人物";
  return peopleLabel(w.medium);
}

/**
 * ゆきとの関係の名前（予定／進行中／中断／済）。種類に合わせる。保存している値（wish／active／paused／done）は変えない。
 * 「積読」は予定＋持っている、という自動表示用にとってある（予定の名前には使わない）
 */
export function statusWord(medium: Medium, status: WorkStatus): string {
  if (status === "paused") return "中断";
  if (medium === "live") return status === "wish" ? "参戦予定" : "参戦済";
  if (medium === "game") return { active: "プレイ中", wish: "プレイ予定", done: "クリア済" }[status];
  if (isReading(medium)) return { active: "読書中", wish: "読書予定", done: "読了" }[status];
  return { active: "視聴中", wish: "視聴予定", done: "視聴済" }[status];
}

/** 続きを数えないが「途中・中断」を持つ種類（ゲーム・小説） */
export function hasOngoingStatus(medium: Medium): boolean {
  return medium === "game" || medium === "novel";
}

/** 人物の欄の名前（映画・ドラマ＝出演、マンガ・小説＝作者） */
export function peopleLabel(medium: Medium): string {
  if (medium === "live") return "出演者";
  if (medium === "manga" || medium === "novel") return "作者";
  if (medium === "movie" || medium === "drama" || medium === "video") return "出演";
  if (medium === "game") return "開発・メーカー";
  return "人物";
}

/** 写真の保存（季節日記と同じ考え方：縮小してWebP、だめならJPEG。EXIFは残らない） */
export const PHOTO_STORE = "photos";
export const PHOTO_MAX_EDGE = 1200;
/** 一覧用の小さい写真の長辺。一覧の枠は最大でも幅120px前後なので、画面の細かさ（3倍）を見てこの大きさ */
export const THUMB_MAX_EDGE = 360;
export const PHOTO_WEBP_QUALITY = 0.8;
export const PHOTO_JPEG_QUALITY = 0.82;

/** AniListの情報を自動で確かめる間隔（12時間） */
export const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

export const CLEAR_LABEL = { clear: "クリア", complete: "やりこみ", partway: "途中まで" } as const;
/** 購入の形の名前 */
export const PURCHASE_FORMAT_LABEL: Record<PurchaseFormat, string> = {
  paper: "紙",
  digital: "電子",
  tankobon: "単行本",
  bunko: "文庫",
  tankobon_bunko: "単行本と文庫",
  ebook: "電子",
  bluray: "Blu-ray",
  dvd: "DVD",
  package: "パッケージ",
  download: "ダウンロード",
};
/** ハードの候補（自由入力もできる） */
export const PLATFORMS = ["Switch", "スマホ", "PS5", "PS4", "PC", "3DS", "DS", "Wii", "PS2", "ゲームボーイ"];

/** 購入の段階の名前（v0.17.0 で 未所持／購入予定／予約済／所持 から変えた） */
export const PURCHASE_STAGE_LABEL: Record<PurchaseStage, string> = { none: "持ってない", planned: "買う予定", reserved: "予約済み", owned: "持ってる" };
/** 読む・見る手段の名前 */
export const ACCESS_LABEL: Record<Exclude<Access, null>, string> = { paper: "紙", digital: "電子", manga_cafe: "漫喫", streaming: "配信" };
/** 電子のときの2段目の名前 */
export const DIGITAL_STORE_LABEL: Record<DigitalStore, string> = { kindle: "Kindle", jump_plus: "ジャンプ＋", other: "その他" };

/** 「紙」「電子・Kindle」「電子」の形（巻の範囲・購入の形・読む手段で共通） */
export function shapeText(medium: RangeMedium | "manga_cafe" | "streaming", store: DigitalStore | null | undefined): string {
  if (medium === null) return "";
  if (medium === "paper") return "紙";
  if (medium === "manga_cafe") return "漫喫";
  if (medium === "streaming") return "配信";
  return store ? `電子・${DIGITAL_STORE_LABEL[store]}` : "電子";
}

/** 購入の形の名前（マンガの電子は2段目まで） */
export function purchaseFormatText(format: PurchaseFormat | null, store: DigitalStore | null): string {
  if (!format) return "";
  if (format === "digital") return shapeText("digital", store);
  return PURCHASE_FORMAT_LABEL[format];
}

/** 読む・見る手段の名前（電子は2段目まで） */
export function accessText(access: Access, store: DigitalStore | null): string {
  if (!access) return "";
  return access === "digital" ? shapeText("digital", store) : ACCESS_LABEL[access];
}

/** 楽しみの日の、種類ごとの名前（発売日・公開日・開催日・放送開始日） */
export function expectLabel(medium: Medium): string {
  if (medium === "anime" || medium === "drama") return "放送開始日";
  if (medium === "movie") return "公開日";
  if (medium === "live") return "開催日";
  return "発売日";
}
/** 版の候補（自由入力もできる） */
export const EDITION_CANDIDATES = ["限定版", "通常版", "初回限定版", "新装版", "完全版"];

/** 購入の形の選択肢（種類ごと）。出さない種類は空 */
export function purchaseFormatChoices(medium: Medium): PurchaseFormat[] {
  if (medium === "manga") return ["paper", "digital"];
  if (medium === "novel") return ["tankobon", "bunko", "tankobon_bunko", "ebook"];
  // 円盤（Blu-ray・DVD）は映像作品だけが持つ。イベント（LIVE）には購入の形を出さない（v0.20.0）
  if (medium === "video") return ["bluray", "dvd"];
  if (medium === "game") return ["package", "download"];
  return [];
}

/** 作品の状態の言い方。続きを数える種類は「放送中／連載中」、単発ものは「発売前・公開前・開催前」など */
export function workStateWord(medium: Medium, state: WorkState): string {
  const kind = PROGRESS_KIND[medium];
  if (state === null) return "不明";
  if (state === "upcoming") {
    if (medium === "anime" || medium === "drama") return "放送前";
    if (kind !== "none") return "連載前";
    return medium === "live" ? "開催前" : medium === "movie" || medium === "video" ? "公開前" : "発売前";
  }
  if (state === "ongoing") return medium === "anime" || medium === "drama" ? "放送中" : kind === "none" ? "進行中" : "連載中";
  if (kind !== "none") return "完結";
  return medium === "live" ? "開催済" : medium === "movie" || medium === "video" ? "公開済" : "発売済";
}

/** 編集画面の選択肢（単発ものは「進行中」を出さない） */
export function workStateChoices(medium: Medium): WorkState[] {
  return PROGRESS_KIND[medium] === "none" ? ["upcoming", "finished", null] : ["upcoming", "ongoing", "finished", null];
}

/** 視聴手段の名前 */
export const LOG_VIA_LABEL: Record<LogVia, string> = {
  broadcast: "放送",
  rerun: "再放送",
  streaming: "配信",
  disc: "円盤",
  recording: "録画",
  venue: "劇場・会場",
};

/** 記録に視聴手段を出す種類（マンガ・小説・週刊誌・ゲームは出さない） */
export function hasVia(medium: Medium): boolean {
  return medium === "anime" || medium === "drama" || medium === "movie" || medium === "video" || medium === "live";
}
