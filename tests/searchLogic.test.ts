import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecentSearches, rememberRecentSearch, removeRecentSearch } from "../src/searchLogic.js";

test("最近の検索語は成功した検索だけを新しい順に8件まで覚える", () => {
  let recent: string[] = [];
  for (let i = 1; i <= 10; i += 1) recent = rememberRecentSearch(recent, `言葉${i}`, true);
  assert.deepEqual(recent, ["言葉10", "言葉9", "言葉8", "言葉7", "言葉6", "言葉5", "言葉4", "言葉3"]);
  assert.deepEqual(rememberRecentSearch(recent, "見つからない", false), recent);
});

test("同じ検索語は表記ゆれも1つにまとめ、個別に消せる", () => {
  const recent = rememberRecentSearch(["ＡＢＣ", "別の言葉"], "abc", true);
  assert.deepEqual(recent, ["abc", "別の言葉"]);
  assert.deepEqual(removeRecentSearch(recent, "ＡＢＣ"), ["別の言葉"]);
});

test("保存値は文字列だけを受け取り、空と重複を除く", () => {
  assert.deepEqual(parseRecentSearches([" 感想 ", 1, "", "感想", "作品"]), ["感想", "作品"]);
  assert.deepEqual(parseRecentSearches({}), []);
});
