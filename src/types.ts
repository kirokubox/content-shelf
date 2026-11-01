// コンテンツ棚のデータの形。仕様の正本：05_開発・Webアプリ/18_コンテンツ棚/181_コンテンツ棚_初期仕様.md

export const MEDIA = ["anime", "drama", "magazine", "manga", "novel", "movie", "game", "live", "video", "other"] as const;
export type Medium = (typeof MEDIA)[number];

/** 続きの数え方。メディアから決まる */
export type ProgressKind = "episode" | "issue" | "volume" | "none";

/** active＝進行中、paused＝休止中、wish＝見たい・読みたい、done＝見終わった・読み終わった（記録へ） */
export const WORK_STATUSES = ["active", "paused", "wish", "done"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export type OwnedMedium = "paper" | "kindle" | "jump_plus" | null;
export type PaperPlace = "home" | "parents_home" | "both" | "unknown" | null;

export interface VolumeRange {
  from: number;
  to: number;
}

export interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** 論理削除（null＝有効） */
  deletedAt: string | null;
}

/** 親作品（原作・シリーズのくくり）。任意 */
export interface Franchise extends Base {
  title: string;
  kana: string;
  memo: string;
}

/**
 * 毎週たまる予定（アニメ・ドラマは放送、週刊誌は発売）。
 * firstDate の曜日で毎週1つ増える。skipDates に入れた日（休止・合併号の翌週など）は数えない。
 */
export interface WeeklySchedule {
  /** 初回（または数え始め）の日 YYYY-MM-DD */
  firstDate: string;
  /** firstDate の回が第何話か（アニメ・ドラマ）。週刊誌は使わない（1） */
  firstNumber: number;
  /** 数えない日 YYYY-MM-DD */
  skipDates: string[];
}

export interface Ownership {
  /** 持っている巻が分かっているか */
  known: boolean;
  ranges: VolumeRange[];
  medium: OwnedMedium;
  place: PaperPlace;
}

export interface Work extends Base {
  medium: Medium;
  title: string;
  kana: string;
  /** シーズン・編の名前（例：第2期） */
  seasonLabel: string;
  franchiseId: string | null;
  status: WorkStatus;
  /** 放送・連載が終わっているか（true＝完結、false＝続いている、null＝分からない） */
  finished: boolean | null;
  /** 総話数・総巻数（分からなければ null） */
  total: number | null;
  /** 手で入れた最新（放送済みの話数・既刊）。schedule があるときは schedule が優先 */
  latestKnown: number | null;
  schedule: WeeklySchedule | null;
  /** 見た話数・読んだ巻（何話まで／何巻まで）。分からなければ null */
  progress: number | null;
  /** 週刊誌：最後に読んだ号の発売日 YYYY-MM-DD */
  readThrough: string | null;
  /** マンガの所持（マンガ以外は null） */
  owned: Ownership | null;
  /** 版の名前（新装版など） */
  edition: string;
  externalIds: { anilist?: number; mangaShelf?: string };
  coverUrl: string | null;
  memo: string;
  /** 旧アプリから引き継いだメモ */
  legacyNote: string;
  /** 記録へ移った日時 */
  completedAt: string | null;
  /** 最後に操作した日時（続きの並び順） */
  touchedAt: string;
  /** 出演・アーティストなど、この作品・公演に関わる人物（段階3） */
  personIds: string[];
  /** LIVE・フェスのセットリスト（任意） */
  setlist: string;
  /** 外部（AniList）の情報を最後に確かめた日時（段階4） */
  infoCheckedAt: string | null;
  /** マンガ：新刊を買うシリーズ（新刊と未購入を知らせる。v0.5.0） */
  buying: boolean;
  /** LIVE・LIVE映像：映像を持っている（v0.5.0） */
  videoOwned: VideoOwned;
  /** ゲーム：遊んだハード（Switch・スマホなど。v0.8.0） */
  platform: string;
  /** ゲーム：どこまで遊んだか（v0.8.0） */
  clearLevel: ClearLevel;
  /** 持っている形：ゲーム＝パッケージ／ダウンロード、小説＝単行本／文庫／電子（v0.8.0） */
  ownFormat: OwnFormat;
  /** 原作の印。親作品の中で原作にあたる作品（v0.8.0） */
  isOriginal: boolean;
}

export type ClearLevel = "clear" | "complete" | "partway" | null;
export type OwnFormat = "package" | "download" | "tankobon" | "bunko" | "ebook" | null;
/** 記録の日付の細かさ。year＝年だけ（date は YYYY-01-01）、month＝年月だけ（YYYY-MM-01） */
export type DatePrecision = "day" | "month" | "year";

export type VideoOwned = "dvd" | "bluray" | "digital" | null;

/** progress＝続きを1つ進めた記録、view＝見た・読んだ・参加した記録（映画・小説など） */
export type LogKind = "progress" | "view";

/** 楽しんだ記録。再視聴・再読は上書きせず追加する */
export interface Log extends Base {
  workId: string;
  kind: LogKind;
  /** 楽しんだ日 YYYY-MM-DD */
  date: string;
  /** 第何話・何巻（分からなければ null） */
  position: number | null;
  /** 週刊誌：何日発売の号 */
  issueDate: string | null;
  note: string;
  /** 星（1〜5、任意） */
  rating: number | null;
  /** どこで・どうやって（映画館・配信・家など） */
  place: string;
  /** 取り込み元（かぞえ帳など）。手で付けた記録は空 */
  source: string;
  /** 日付の細かさ（無ければ day。v0.8.0） */
  datePrecision?: DatePrecision;
}

/** 人物（俳優・女優・アーティストなど）。手で登録する（仕様181 §2） */
export interface Person extends Base {
  name: string;
  kana: string;
  memo: string;
}

export interface DataSet {
  franchises: Franchise[];
  works: Work[];
  logs: Log[];
  people: Person[];
}

export interface BackupFile extends DataSet {
  app: "content-shelf";
  version: 1;
  exportedAt: string;
}
