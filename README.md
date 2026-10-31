# コンテンツ棚

アニメ・ドラマ・週刊誌・マンガの「どこまで見たか・読んだか」と未消化の数、映画・小説の「いつ見たか・感想」をためていく、ブラウザで動く記録アプリです。

- 公開版：https://kirokubox.github.io/content-shelf/
- データはその端末のブラウザの中（IndexedDB）だけに保存されます。サーバーやログインはありません。設定からバックアップ（JSON）を保存・読み込みできます。
- アニメ・ドラマは放送曜日、週刊誌は発売曜日から、今日までに出た話数・号数を数えて未消化を出します（外部のデータは使いません）。

## 開発

```
npm install
npm run dev
npm test
npm run build
```

React / TypeScript / Vite。GitHub Pages へは `main` への push で自動で公開されます（`.github/workflows/deploy.yml`）。

アイコンの図形は Lucide（ISC License）を使っています。
