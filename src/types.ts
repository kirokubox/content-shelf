// コンテンツ棚のデータの形。仕様の正本：05_開発・Webアプリ/18_コンテンツ棚/181_コンテンツ棚_初期仕様.md

export const MEDIA = ["anime", "drama", "magazine", "manga", "novel", "movie", "game", "live", "video", "other"] as const;
export type Medium = (typeof MEDIA)[number];

/** 続きの数え方。メディアから決まる */
export type ProgressKind = "episode" | "issue" | "volume" | "none";

/** active＝進行中、paused＝休止中、wish＝見たい・読みたい、done＝見終わった・読み終わった（記録へ） */
export const WORK_STATUSES = ["active", "paused", "wish", "done"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/** マンガの巻の範囲ごとの形（紙／電子）。null＝不明。電子のときは store（Kindle・ジャンプ＋・その他）を持つ（v0.17.0） */
export type RangeMedium = "paper" | "digital" | null;
/** 電子のときの2段目（どこで買った・読むか） */
export type DigitalStore = "kindle" | "jump_plus" | "other";
export const DIGITAL_STORES = ["kindle", "jump_plus", "other"] as const;
/** 作品の状態（作品側の事実）。null＝分からない。単発ものは upcoming か finished だけ（v0.16.0） */
export type WorkState = "upcoming" | "ongoing" | "finished" | null;
export const WORK_STATES = ["upcoming", "ongoing", "finished"] as const;
export type Season = "winter" | "spring" | "summer" | "fall";
export const SEASONS = ["winter", "spring", "summer", "fall"] as const;
/** クール（放送の時期）。kind＝本放送（original）か再放送（rerun） */
export interface Cour {
  year: number;
  season: Season;
  kind: "original" | "rerun";
}
/** 購入の段階（ゆきとの関係とは別の軸） */
export type PurchaseStage = "none" | "planned" | "reserved" | "owned";
export const PURCHASE_STAGES = ["none", "planned", "reserved", "owned"] as const;
/** 購入の形：マンガ＝紙／電子（＋store）、小説＝単行本・文庫・電子、映像・イベント＝BD／DVD、ゲーム＝パッケージ／ダウンロード。v0.16の kindle は digital＋kindle へ移した */
export type PurchaseFormat = "paper" | "digital" | "tankobon" | "bunko" | "tankobon_bunko" | "ebook" | "bluray" | "dvd" | "package" | "download";
export const PURCHASE_FORMATS = ["paper", "digital", "tankobon", "bunko", "tankobon_bunko", "ebook", "bluray", "dvd", "package", "download"] as const;
export interface Purchase {
  stage: PurchaseStage;
  format: PurchaseFormat | null;
  /** format が digital のときの2段目（v0.17.0） */
  store: DigitalStore | null;
}
/**
 * 読む・見る手段（購入とは別）。paper＝紙、digital＝電子（accessStore で Kindle・ジャンプ＋・その他）、manga_cafe＝漫喫、streaming＝配信で見る。
 * v0.16の jump_plus は digital＋jump_plus へ移した（v0.17.0）
 */
export type Access = "paper" | "digital" | "manga_cafe" | "streaming" | null;
export const ACCESSES = ["paper", "digital", "manga_cafe", "streaming"] as const;
/** 日付と細かさ（楽しみの日。記録の日付と同じ考え方で、日・月だけ・年だけ） */
export interface FuzzyDate {
  /** YYYY-MM-DD（月だけは YYYY-MM-01、年だけは YYYY-01-01） */
  date: string;
  precision: "day" | "month" | "year";
}
/** マンガの巻ごとの楽しみの日（予約中の巻・買う予定の巻の発売日） */
export interface VolumeDate {
  volume: number;
  date: FuzzyDate;
}
/** 記録ごとの視聴手段 */
export type LogVia = "broadcast" | "rerun" | "streaming" | "disc" | "recording" | "venue";
export const LOG_VIAS = ["broadcast", "rerun", "streaming", "disc", "recording", "venue"] as const;
/** イベントの区分（v0.9.0）。null＝未設定（LIVEと同じに扱う） */
export type EventKind = "live" | "fes" | "food" | "exhibit" | "other" | null;

export type PaperPlace = "home" | "parents_home" | "both" | "unknown" | null;

export interface VolumeRange {
  from: number;
  to: number;
  /** 範囲ごとの紙／電子（無ければ不明） */
  medium?: RangeMedium;
  /** 電子のときの2段目 */
  store?: DigitalStore | null;
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
  /** 予約中の巻（買った巻とは別。v0.16.0） */
  reserved: VolumeRange[];
  place: PaperPlace;
  /** 巻ごとの楽しみの日（発売日。v0.17.0） */
  volumeDates: VolumeDate[];
}

export interface Work extends Base {
  medium: Medium;
  title: string;
  kana: string;
  /** 期・編・巻の名前（例：第2期、○○編、上、第一集） */
  partLabel: string;
  /** クール（放送の時期）。複数持てる（本放送と再放送など） */
  cours: Cour[];
  /** 何周目か（既定1。「もう一度見る／読む」で増える） */
  rounds: number;
  franchiseId: string | null;
  status: WorkStatus;
  /** 作品の状態（始まる前／進行中／完結。null＝分からない） */
  workState: WorkState;
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
  /** 版の名前（限定版・通常版・新装版など） */
  edition: string;
  /** 購入（段階と形）。ゆきとの関係（status）とは別 */
  purchase: Purchase;
  /** 読む・見る手段（紙・電子・漫喫・配信） */
  access: Access;
  /** access が digital のときの2段目（v0.17.0） */
  accessStore: DigitalStore | null;
  /** 楽しみの日（発売日・公開日・開催日・放送開始日。アニメ・ドラマで放送予定があるときは放送予定の初回を使う。v0.17.0） */
  expect: FuzzyDate | null;
  /** ホームに出す積読（全体で1冊だけ。v0.17.0） */
  homePick: boolean;
  externalIds: { anilist?: number; mangaShelf?: string };
  coverUrl: string | null;
  /** 自分で撮った表紙の写真（photos ストアの id）。coverUrl より優先して出す（v0.9.0） */
  coverPhotoId: string | null;
  memo: string;
  /** 旧アプリから引き継いだメモ */
  legacyNote: string;
  /** 記録へ移った日時 */
  completedAt: string | null;
  /** 最後に操作した日時（続きの並び順） */
  touchedAt: string;
  /** 出演・アーティストなど、この作品・公演に関わる人物（段階3） */
  personIds: string[];
  /** イベント（LIVE・フェス）と映像作品のセットリスト（任意） */
  setlist: string;
  /** 外部（AniList）の情報を最後に確かめた日時（段階4） */
  infoCheckedAt: string | null;
  /** マンガ：続きの巻も買う（新刊と未購入を知らせる。v0.5.0） */
  buying: boolean;
  /** ゲーム：遊んだハード（Switch・スマホなど。v0.8.0） */
  platform: string;
  /** ゲーム：どこまで遊んだか（v0.8.0） */
  clearLevel: ClearLevel;
  /** 原作の印。親作品の中で原作にあたる作品（v0.8.0） */
  isOriginal: boolean;
  /** 小説の置き場所（自宅・実家など。マンガは owned.place。v0.8.1） */
  shelfPlace: PaperPlace;
  /** イベントの区分（イベント以外は null。v0.9.0） */
  eventKind: EventKind;
}

export type ClearLevel = "clear" | "complete" | "partway" | null;
/** 記録の日付の細かさ。year＝年だけ（date は YYYY-01-01）、month＝年月だけ（YYYY-MM-01）、unknown＝日付不明（date は 1900-01-01。v0.17.0） */
export type DatePrecision = "day" | "month" | "year" | "unknown";
/** 日付不明の記録に入れておく日付 */
export const UNKNOWN_DATE = "1900-01-01";

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
  /** 会場名など（映画館・会場の名前・家など）。視聴手段は via */
  place: string;
  /** 視聴手段（放送・再放送・配信・円盤・録画・劇場／会場）。無ければ null（v0.16.0） */
  via: LogVia | null;
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
  /** 人物の画像のURL（アーティスト写真など。無ければ null。v0.18.0。古いデータには項目が無い） */
  imageUrl?: string | null;
}

export interface DataSet {
  franchises: Franchise[];
  works: Work[];
  logs: Log[];
  people: Person[];
}

export interface BackupFile extends DataSet {
  app: "content-shelf";
  /** 3＝v0.17.0以降の形。1・2は読み込み時に移し替える */
  version: 1 | 2 | 3;
  exportedAt: string;
}

/** 写真の情報（バックアップのJSONに入れる。画像本体は ZIP の photos/ に別に入る） */
export interface PhotoMeta {
  id: string;
  workId: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
}

/** IndexedDB の photos ストアに入る写真（画像本体つき） */
export interface StoredPhoto extends PhotoMeta {
  blob: Blob;
  /** 一覧用の小さい写真（バックアップには入れず、取り込むときに作り直す） */
  thumb?: Blob;
}
