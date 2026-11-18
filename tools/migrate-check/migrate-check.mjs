// 版1のバックアップ（JSON）を、版2の形へ移し替えるときの結果だけを見る確認用スクリプト。
// 使い方（リポジトリ直下で）：
//   npm run migrate:check -- <版1のバックアップJSONのパス> [--out <書き出し先のパス>]
// 何も書き込まない（--out を付けたときだけ、移し替えたあとのJSONを指定先へ書く）。
// 実データのバックアップをこのリポジトリの中に置かないこと（作業場の外のパスを渡す）。
import { readFileSync, writeFileSync } from "node:fs";
import { buildBackup, parseBackup } from "../../.test-build/src/backup.js";
import { describeMigration } from "../../.test-build/src/migrate.js";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 ? args[outIndex + 1] : null;
const input = args.find((a, i) => !a.startsWith("--") && (outIndex < 0 || i !== outIndex + 1));
if (!input) {
  console.error("使い方：npm run migrate:check -- <版1のバックアップJSONのパス> [--out <書き出し先>]");
  process.exit(2);
}

const text = readFileSync(input, "utf-8");
const r = parseBackup(text);
if (!r.ok) {
  console.error(`読めませんでした：${r.error}`);
  process.exit(1);
}
if (!r.migration) {
  console.log("このファイルはすでに版2の形です（移し替えは不要）。");
  process.exit(0);
}
console.log("版1 → 版2 の移し替え結果（件数は前→後）");
for (const line of describeMigration(r.migration)) console.log(line);
if (out) {
  const photos = JSON.parse(text).photos;
  const file = { ...buildBackup(r.data, r.exportedAt || new Date().toISOString()), ...(Array.isArray(photos) ? { photos } : {}) };
  writeFileSync(out, JSON.stringify(file, null, 2), "utf-8");
  console.log(`移し替えたJSONを書き出しました：${out}`);
}
