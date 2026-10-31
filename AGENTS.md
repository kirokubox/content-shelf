# content-shelf（コンテンツ棚 アプリ本体）フォルダマップ

コード・Git操作・ビルドの正本はここ。

## 正本の場所

- コード・Git操作・ビルド：ここ（`09_開発\01_自分用アプリ\content-shelf`）
- 仕様・要件・改善履歴などの資料：`C:\Users\masat\yuki_local_workspace\05_開発・Webアプリ\18_コンテンツ棚`（要件の正本は `186_コンテンツ棚_要件と経緯.md`、初期仕様は `181_コンテンツ棚_初期仕様.md`、改善履歴は `185_…`）
- コーディングルール：`09_開発\AGENTS.md`
- Webアプリ開発の共通ルール：`05_開発・Webアプリ\00_共通\`（見た目は `25_共有_アプリ共通の見た目ルール.md`）

## ルール

- 仕様書・改善履歴・調査資料をここに増やさない。資料の更新は05側の該当ファイルを直す
- 個人データ（バックアップ `content-shelf-backup-*.json`・マンガ棚やかぞえ帳のバックアップ・感想）をコミットしない。`public/` にも置かない
- テストと見本には架空データだけを使う（実在の作品名も避ける）
- 検証：`npm run build`（型チェック＋本番ビルド）と `npm test`（純粋ロジックの `node --test`）を通す
- 版番号：`src/constants.ts` の `APP_VERSION` と `package.json` の version をそろえ、変更をpushするたびに上げる
- `package.json` に `"latest"` を書かない。削除は論理削除（`deletedAt`）

## コード構成（要点）

- 純粋ロジック（テスト対象）：`src/types.ts`（型）、`src/constants.ts`（DB名・メディアの表示名と数え方・版番号）、`src/dateUtils.ts`（暦日 `YYYY-MM-DD`）、`src/progressLogic.ts`（放送済み・既刊・未消化・＋1・記録への自動切り替え）、`src/backup.ts`（バックアップの保存・検証・追加の差分）、`src/mangaShelfImport.ts`（マンガ棚のバックアップの変換）、`src/summaryLogic.ts`（集計）、`src/searchLogic.ts`（検索）、`src/workFactory.ts`（新しい作品・記録）、`src/dataOps.ts`（変更の反映）
- 保存：`src/storage.ts`（IndexedDB。DB名 `content-shelf`、ストア `franchises`・`works`・`logs`）
- 画面：`src/App.tsx`（骨組み・重ねる画面の管理）、`src/TabBar.tsx`（下タブ4つ）、`src/TabViews.tsx`（ホーム・続き・記録・集計）、`src/WorkCard.tsx`（続きのカードと＋1の長押し）、`src/WorkDetail.tsx`・`src/WorkEditor.tsx`・`src/LogSheet.tsx`（詳細・登録と編集・記録1件）、`src/SearchView.tsx`、`src/SettingsView.tsx`、`src/Screen.tsx`（全画面の枠・…メニュー・星）、共通部品 `src/BottomSheet.tsx`・`src/Toast.tsx`・`src/Icon.tsx`・`src/tokens.css`（家計簿から写した）
