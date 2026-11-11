import { test } from "node:test";
import assert from "node:assert/strict";
import { addReaderLogLabel, readerPosition } from "../src/logReaderLogic.js";
import { emptyWork, newLog } from "../src/workFactory.js";

const NOW = "2026-11-12T03:00:00.000Z";

test("同じ作品の複数記録を古い順に行き来でき、次の記録を足す入口を出す", () => {
  const live = { ...emptyWork("live", NOW), title: "架空ツアー" };
  const first = { ...newLog({ workId: live.id, kind: "view", date: "2026-11-01" }, NOW), id: "log-1", createdAt: "2026-11-01T12:00:00.000Z" };
  const second = { ...newLog({ workId: live.id, kind: "view", date: "2026-11-08" }, NOW), id: "log-2", createdAt: "2026-11-08T12:00:00.000Z" };
  const state = readerPosition([second, first], live.id, second.id);
  assert.equal(state.total, 2);
  assert.equal(state.index, 1);
  assert.equal(state.previous?.id, first.id);
  assert.equal(state.next, null);
  assert.equal(addReaderLogLabel(live), "この作品にもう1件記録する");
});

test("進み具合を数える作品では感想を残すと表示する", () => {
  const manga = emptyWork("manga", NOW);
  assert.equal(addReaderLogLabel(manga), "感想を残す");
});
