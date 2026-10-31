"""かぞえ帳のバックアップ（kazoe-cho-backup-*.json）から、作品の記録をコンテンツ棚のバックアップ形式へ変換する。

使い方:
    python -X utf8 convert.py <かぞえ帳のバックアップ.json> <出力.json> [--manga-shelf <マンガ棚のバックアップ.json>] [--report <レポート.md>]

出力はコンテンツ棚の「設定 > バックアップから追加」で読み込む（同じ id は二重に入らない）。
本人の実データを扱うので、入出力のファイルはリポジトリの外（05_開発・Webアプリ/18_コンテンツ棚/backup_json/）に置く。

方針（仕様 181 §6.2）:
- 移すのは「楽しみ」カテゴリのうち、アニメ・マンガ（週刊誌・単行本）・映画・本・音楽（LIVE）。
  サウナ・散歩・家事・デートなど作品以外は移さない（キロクカレンダーの担当）。
- かぞえ帳の記録には「何話か」が無い。話数・巻数・感想は作らず、「楽しんだ日＋放送日（対象日）＋メモ」だけを記録にする。
- アニメの続き：いま有効な項目は、かぞえ帳で数え始めた日（inventoryStartDate）を1回目として放送曜日で数える。
  見た回数＝完了の数。実際の話数とずれる場合があるので、作品のメモに注意書きを残す。
- 終わったアニメ（かぞえ帳から消えた項目）：記録が8回以上なら「最後まで見た（記録）」、それより少なければ「休止中」。
  完結かどうかは分からないので finished は null のまま。
- 週刊誌：発売曜日で数え、最後に読んだ号＝完了した対象日のうち一番新しい日。
- 単発の在庫（未読の小説・公開待ちの映画・先のLIVE）は「見たい・読みたい」。
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from datetime import date, datetime, timedelta, timezone

NOW = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
DONE_THRESHOLD = 8


def iso_date(local_dt: str) -> str:
    """かぞえ帳の時刻（端末の時刻、ゾーンなし）の日付部分"""
    return local_dt[:10]


def to_iso(local_dt: str) -> str:
    """ゾーンなしの日本時間を ISO（UTC）へ"""
    dt = datetime.fromisoformat(local_dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone(timedelta(hours=9)))
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def base(id_: str, created: str, updated: str) -> dict:
    return {"id": id_, "createdAt": created, "updatedAt": updated, "deletedAt": None}


def empty_work(id_: str, medium: str, title: str, created: str, updated: str) -> dict:
    return {
        **base(id_, created, updated),
        "medium": medium,
        "title": title,
        "kana": "",
        "seasonLabel": "",
        "franchiseId": None,
        "status": "active",
        "finished": None,
        "total": None,
        "latestKnown": None,
        "schedule": None,
        "progress": None,
        "readThrough": None,
        "owned": {"known": False, "ranges": [], "medium": None, "place": None} if medium == "manga" else None,
        "edition": "",
        "externalIds": {},
        "coverUrl": None,
        "memo": "",
        "legacyNote": "",
        "completedAt": None,
        "touchedAt": updated,
    }


def log(id_: str, work_id: str, kind: str, comp: dict, issue_date: str | None = None, note_extra: str = "") -> dict:
    note = "　".join([x for x in [comp.get("note") or "", note_extra] if x])
    return {
        **base(id_, to_iso(comp["completedAt"]), to_iso(comp["completedAt"])),
        "workId": work_id,
        "kind": kind,
        "date": iso_date(comp["completedAt"]),
        "position": None,
        "issueDate": issue_date,
        "note": note,
        "rating": None,
        "place": "",
        "source": "かぞえ帳",
    }


def kazoe_dates(item: dict, today: str) -> list[str]:
    """かぞえ帳と同じ数え方の対象日（数え始め＝inventoryStartDate、無ければ作成日。曜日は item の weekday。0＝日曜）"""
    start = date.fromisoformat(item.get("inventoryStartDate") or item["createdAt"][:10])
    end = date.fromisoformat(today)
    for stamp in (item.get("stoppedAt"), item.get("deletedAt")):
        if stamp and stamp[:10] < end.isoformat():
            end = date.fromisoformat(stamp[:10])
    py_wd = (item["weekday"] - 1) % 7  # Python は月曜＝0
    out = []
    cur = start
    while cur <= end:
        if cur.weekday() == py_wd:
            out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


def remaining(item: dict, done: set, today: str) -> list[str]:
    return [d for d in kazoe_dates(item, today) if (item["id"], d) not in done]


def convert(kazoe: dict, manga_shelf: dict | None, today: str) -> tuple[dict, list[str]]:
    items = {i["id"]: i for i in kazoe["items"]}
    done = {(c["itemId"], c["targetDate"]) for c in kazoe["completions"]}
    report: list[str] = []
    works: list[dict] = []
    logs: list[dict] = []

    enjoy = [c for c in kazoe["completions"] if c["categorySnapshot"] == "楽しみ"]
    by_group: dict[str, list[dict]] = collections.defaultdict(list)
    for c in enjoy:
        by_group[c["groupSnapshot"] or ""].append(c)

    # ---- アニメ（題名ごとに1作品。同じ題名の項目はまとめる）
    anime_by_title: dict[str, list[dict]] = collections.defaultdict(list)
    for c in by_group.get("アニメ", []):
        anime_by_title[c["titleSnapshot"]].append(c)
    # 記録が0件でも、いま有効な毎週の項目は続きとして移す
    for it in kazoe["items"]:
        if it["group"] == "アニメ" and it["repeatType"] == "weekly" and it["isActive"] and not it["deletedAt"]:
            anime_by_title.setdefault(it["title"], [])
    report.append("## アニメ\n\n| 作品 | 記録 | 状態 | 数え方 |\n|---|---|---|---|")
    for title, comps in sorted(anime_by_title.items()):
        comps.sort(key=lambda c: c["completedAt"])
        same = [i for i in kazoe["items"] if i["group"] == "アニメ" and i["title"] == title and i["repeatType"] == "weekly"]
        live_items = [i for i in same if i["isActive"] and not i["deletedAt"]]
        # 記録のある有効な項目を優先（同じ題名が2つある場合）
        live_items.sort(key=lambda i: -sum(1 for c in comps if c["itemId"] == i["id"]))
        src = live_items[0] if live_items else (same[0] if same else None)
        created = (src or {}).get("createdAt") or (to_iso(comps[0]["completedAt"]) if comps else NOW)
        updated = to_iso(comps[-1]["completedAt"]) if comps else created
        wid = f"kazoe:anime:{src['id'] if src else title}"
        w = empty_work(wid, "anime", title, created, updated)
        w["progress"] = len(comps) if comps else None
        if live_items:
            # 未消化をかぞえ帳と同じにする：数え始めの回を第1話とし、見た話数＝放送済み−かぞえ帳の残り
            aired = kazoe_dates(src, today)
            first = aired[0] if aired else (src.get("inventoryStartDate") or today)
            w["schedule"] = {"firstDate": first, "firstNumber": 1, "skipDates": []}
            w["progress"] = len(aired) - len(remaining(src, done, today))
            w["memo"] = "かぞえ帳から移行。話数は、かぞえ帳で数え始めた回を第1話として数えています。実際の話数に直すときは「何話まで見た」と「その回は第何話」を両方直してください。"
            status, how = "active", f"毎週（{first} から）"
        else:
            stopped = bool(same) and any(not i["isActive"] for i in same)
            if len(comps) >= DONE_THRESHOLD and not stopped:
                w["status"] = "done"
                w["completedAt"] = updated
                status = "done"
            else:
                w["status"] = "paused"
                status = "paused"
            w["memo"] = "かぞえ帳から移行。見た回数は分かりますが、何話までかは分かりません。"
            how = "—"
        works.append(w)
        for c in comps:
            logs.append(log(f"kazoe:log:{c['id']}", wid, "progress", c, note_extra=f"放送日 {c['targetDate']}"))
        report.append(f"| {title} | {len(comps)} | {status} | {how} |")

    # ---- 週刊誌
    report.append("\n## 週刊誌\n\n| 誌名 | 記録 | 最後に読んだ号 |\n|---|---|---|")
    for it in kazoe["items"]:
        if it["group"] != "マンガ" or it["repeatType"] != "weekly":
            continue
        comps = sorted([c for c in by_group.get("マンガ", []) if c["itemId"] == it["id"]], key=lambda c: c["completedAt"])
        issues = kazoe_dates(it, today)
        rest = remaining(it, done, today)
        if rest and any(d > rest[0] for d in issues if d not in rest):
            report.append(f"| （注意）{it['title']} | 読んでいない号の後に読んだ号があります。最後に読んだ号は、読んでいない最初の号の前にしました | |")
        first = issues[0] if issues else it["createdAt"][:10]
        wid = f"kazoe:magazine:{it['id']}"
        updated = to_iso(comps[-1]["completedAt"]) if comps else it["updatedAt"]
        w = empty_work(wid, "magazine", it["title"], it["createdAt"], updated)
        w["schedule"] = {"firstDate": first, "firstNumber": 1, "skipDates": []}
        # 未読をかぞえ帳と同じにする：読んでいない最初の号の1週前まで読んだことにする
        w["readThrough"] = (date.fromisoformat(rest[0]) - timedelta(days=7)).isoformat() if rest else (issues[-1] if issues else None)
        if w["readThrough"] is not None and w["readThrough"] < first:
            w["readThrough"] = None
        w["memo"] = "かぞえ帳から移行。合併号の翌週などの休みの週は入っていません。"
        works.append(w)
        for c in comps:
            logs.append({**log(f"kazoe:log:{c['id']}", wid, "progress", c, issue_date=c["targetDate"])})
        report.append(f"| {it['title']} | {len(comps)} | {w['readThrough'] or '—'} |")

    # ---- 単発（映画・単行本・LIVE）の記録
    medium_of_group = {"映画": "movie", "音楽": "live", "本": "novel"}
    report.append("\n## 映画・LIVE・本（見た・行った記録）\n\n| 種類 | 題名 | 日付 | メモ |\n|---|---|---|---|")
    single_ids = {i["id"] for i in kazoe["items"] if i["repeatType"] == "single"}
    for g, medium in medium_of_group.items():
        for c in sorted(by_group.get(g, []), key=lambda c: c["completedAt"]):
            wid = f"kazoe:{medium}:{c['id']}"
            w = empty_work(wid, medium, c["titleSnapshot"], to_iso(c["completedAt"]), to_iso(c["completedAt"]))
            w["status"] = "done"
            w["completedAt"] = to_iso(c["completedAt"])
            works.append(w)
            logs.append(log(f"kazoe:log:{c['id']}", wid, "view", c))
            report.append(f"| {medium} | {c['titleSnapshot']} | {iso_date(c['completedAt'])} | {c.get('note') or ''} |")

    # 単行本（マンガの単発）。マンガ棚に同じ題名があれば、その作品の記録にする
    manga_ids = {}
    if manga_shelf:
        manga_ids = {s["title"]: s for s in manga_shelf.get("series", [])}
    for c in by_group.get("マンガ", []):
        if c["itemId"] not in single_ids and items.get(c["itemId"], {}).get("repeatType") != "single":
            continue
        s = manga_ids.get(c["titleSnapshot"])
        if s:
            wid = f"manga-shelf:{s['id']}"
            report.append(f"| manga | {c['titleSnapshot']} | {iso_date(c['completedAt'])} | {c.get('note') or ''}（マンガ棚の作品の記録にする） |")
        else:
            wid = f"kazoe:manga:{c['id']}"
            w = empty_work(wid, "manga", c["titleSnapshot"], to_iso(c["completedAt"]), to_iso(c["completedAt"]))
            works.append(w)
            report.append(f"| manga | {c['titleSnapshot']} | {iso_date(c['completedAt'])} | {c.get('note') or ''} |")
        logs.append(log(f"kazoe:log:{c['id']}", wid, "progress", c))

    # ---- 在庫（見たい・読みたい）
    report.append("\n## 見たい・読みたい（かぞえ帳の在庫）\n\n| 種類 | 題名 |\n|---|---|")
    for s in kazoe["stockEntries"]:
        it = items.get(s["itemId"])
        if not it or it["category"] != "楽しみ" or it["group"] not in medium_of_group:
            continue
        medium = medium_of_group[it["group"]]
        wid = f"kazoe:wish:{s['id']}"
        w = empty_work(wid, medium, s["label"] or it["title"], to_iso(s["addedAt"]), to_iso(s["addedAt"]))
        w["status"] = "wish"
        works.append(w)
        report.append(f"| {medium} | {w['title']} |")

    data = {"app": "content-shelf", "version": 1, "exportedAt": NOW, "franchises": [], "works": works, "logs": logs}

    # ---- 照合：移した記録の数＝かぞえ帳の該当する完了の数
    moved_groups = {"アニメ", "マンガ", "映画", "音楽", "本"}
    expected = sum(1 for c in enjoy if (c["groupSnapshot"] or "") in moved_groups)
    summary = [
        "# かぞえ帳 → コンテンツ棚 変換レポート",
        "",
        f"- 元：かぞえ帳のバックアップ（{kazoe.get('exportedAt', '')}）",
        f"- 作品 {len(works)} 件・記録 {len(logs)} 件を作成",
        f"- 照合：かぞえ帳の「楽しみ」のうちアニメ・マンガ・映画・音楽・本の完了 {expected} 件 → 記録 {len(logs)} 件（{'一致' if expected == len(logs) else '不一致'}）",
        "- 話数・巻数・感想は作っていません。かぞえ帳のメモと放送日（対象日）だけを記録のメモに入れました。",
        f"- 終わったアニメは、記録が{DONE_THRESHOLD}回以上なら「最後まで見た」、少なければ「休止中」にしました（完結かどうかは分からないため、必要なら直してください）。",
        "",
    ]
    return data, summary + report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("kazoe")
    ap.add_argument("out")
    ap.add_argument("--manga-shelf")
    ap.add_argument("--report")
    ap.add_argument("--today", default=date.today().isoformat(), help="未消化を数える基準日（YYYY-MM-DD）")
    a = ap.parse_args()
    kazoe = json.load(open(a.kazoe, encoding="utf-8"))
    manga = json.load(open(a.manga_shelf, encoding="utf-8")) if a.manga_shelf else None
    data, report = convert(kazoe, manga, a.today)
    json.dump(data, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    if a.report:
        open(a.report, "w", encoding="utf-8").write("\n".join(report) + "\n")
    print("\n".join(report[:6]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
