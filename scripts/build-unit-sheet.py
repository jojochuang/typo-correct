#!/usr/bin/env python3
"""
從「總複習」字形表 + 「美洲一課本」課文對照表，產生依單元排序的字形表 CSV。

用法：
  python3 scripts/build-unit-sheet.py

輸入（Google 試算表 CSV export）：
  gid 1734865438 — 遊戲用總複習（A 相似字，B+ 語詞）
  gid 381149373 — 課本對照（C 第幾單元，E/H/I/J 課文・語詞・造句・對話）

輸出：
  美洲一課本-分單元字形.csv（A 第幾單元，B 相似字形，C+ 語詞）
"""
from __future__ import annotations

import csv
import re
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

SHEET_ID = "18yl3VhCmGH1bOVsCQF7cCRFAbyi8VkTaQH9vhJ3g9Rw"
GID_GAME = "1734865438"
GID_REF = "381149373"
OUT_NAME = "美洲一課本-分單元字形.csv"

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / OUT_NAME

REF_COLS = (4, 6, 7, 8, 9)  # E 課文, G 生字, H 語詞, I 造句, J 對話

MANUAL_UNIT = {
    ("也 她 他 地 它", "大家都喜歡她(姊姊󠇡)"): "7",
    ("也 她 他 地 它", "她是我媽媽󠇡"): "7",
    ("青 情 晴 清 睛 猜 請", "好心情友情"): "6",
}


def strip_ivs(s: str) -> str:
    return re.sub(r"[\ufe00-\ufe0f\U000e0100-\U000e01ef]", "", s or "")


def norm(s: str) -> str:
    return strip_ivs(s).strip()


def fetch_csv(gid: str) -> list[list[str]]:
    url = (
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export"
        f"?format=csv&gid={gid}"
    )
    with urllib.request.urlopen(url) as resp:
        text = resp.read().decode("utf-8-sig")
    return list(csv.reader(text.splitlines()))


def hanzi_runs(s: str) -> list[str]:
    runs = re.findall(r"[\u3400-\u9fff]{2,}", norm(s))
    runs.sort(key=len, reverse=True)
    return runs


def find_unit(word: str, ref: list[list[str]]) -> str | None:
    tries = [word, re.sub(r"[（）()\s]", "", word)]
    seen: set[str] = set()
    for t in tries:
        nw = norm(t)
        if nw in seen:
            continue
        seen.add(nw)
        if len(nw) >= 2:
            u = _scan_ref(nw, ref)
            if u:
                return u
        for run in hanzi_runs(t):
            u = _scan_ref(run, ref)
            if u:
                return u
    return None


def _scan_ref(needle: str, ref: list[list[str]]) -> str | None:
    for row in ref[1:]:
        unit = (row[2] if len(row) > 2 else "").strip()
        if not unit:
            continue
        for ci in REF_COLS:
            if ci < len(row) and needle in norm(row[ci] or ""):
                return unit
    return None


def unit_sort_key(u: str) -> tuple:
    if u == "?":
        return (999, "")
    try:
        return (int(float(u)), "")
    except ValueError:
        return (500, u)


def build() -> tuple[list[tuple[str, str, list[str], int]], list[tuple[str, str]]]:
    game = fetch_csv(GID_GAME)
    ref = fetch_csv(GID_REF)

    ref_similar_unit: dict[str, str] = {}
    for row in ref[1:]:
        if len(row) < 3:
            continue
        b, c = row[1].strip(), row[2].strip()
        if b and c:
            ref_similar_unit[norm(b.replace(" ", ""))] = c

    rows_out: list[tuple[str, str, list[str], int]] = []
    unmatched: list[tuple[str, str]] = []

    for row_idx, row in enumerate(game[1:], start=1):
        similar = (row[0] if row else "").strip()
        if not similar or similar == "相似字形":
            continue
        words = [(row[j] or "").strip() for j in range(1, len(row)) if (row[j] or "").strip()]
        if not words:
            continue

        word_units = [(w, find_unit(w, ref)) for w in words]
        matched = [u for _, u in word_units if u]
        default_u = (
            Counter(matched).most_common(1)[0][0]
            if matched
            else ref_similar_unit.get(norm(similar.replace(" ", "")))
        )

        final: list[tuple[str, str]] = []
        for w, u in word_units:
            if not u:
                u = default_u or MANUAL_UNIT.get((similar, w))
            if not u:
                unmatched.append((similar, w))
                u = "?"
            final.append((w, u))

        by_unit: dict[str, list[str]] = defaultdict(list)
        for w, u in final:
            by_unit[u].append(w)

        for u in sorted(by_unit, key=unit_sort_key):
            if u == "?":
                continue
            rows_out.append((u, similar, by_unit[u], row_idx))

    rows_out.sort(key=lambda r: (unit_sort_key(r[0]), r[3]))
    return rows_out, unmatched


def write_csv(rows: list[tuple[str, str, list[str], int]]) -> None:
    max_w = max(len(r[2]) for r in rows)
    with OUT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["第幾單元", "相似字形"] + ["語詞"] * max_w)
        for unit, similar, words, _ in rows:
            w.writerow([unit, similar] + words + [""] * (max_w - len(words)))


def main() -> None:
    rows, unmatched = build()
    write_csv(rows)
    print(f"Wrote {OUT_PATH} ({len(rows)} rows)")
    if unmatched:
        print("Unmatched (need manual MANUAL_UNIT):")
        for s, w in unmatched:
            print(f"  [{s}] {w}")


if __name__ == "__main__":
    main()
