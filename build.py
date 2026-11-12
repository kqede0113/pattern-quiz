#!/usr/bin/env python3
"""source.md から問題データ data.js を生成する。

使い方:  python3 build.py            (source.md -> data.js)
         python3 build.py 別.md       (任意のMarkdownから生成)

source.md の書式:
  ## 節タイトル                       … 節（章）。番号付き推奨「## 3. ○○」
  **Q1.** 問題文  /  **A.** 答え      … 一問一答
  **問題1.** 問題文 / **骨子.** 解答  … 予想記述問題（書いてから骨子を見る形式）
  節の最初の問題より前の地の文は、その節の説明として表示される。
  答えは次の問題・見出しが来るまで複数段落・箇条書きでもよい。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
Q_RE = re.compile(r"^\*\*\s*(Q\s*\d*|問題\s*\d*|問\s*\d*)\s*[.．:：]?\s*\*\*\s*(.*)$")
A_RE = re.compile(r"^\*\*\s*(A|答え?|解答|骨子|模範解答)\s*[.．:：]?\s*\*\*\s*(.*)$")
H2_RE = re.compile(r"^##\s+(.+?)\s*$")
H1_RE = re.compile(r"^#\s+(.+?)\s*$")
WRITTEN_KEYS = ("問題", "骨子", "模範解答")


def card_id(sec_title, question):
    # 問題文ベースのID: source.md を差し替えても、同じ問題なら進捗が引き継がれる
    h = hashlib.sha1((question.strip()).encode("utf-8")).hexdigest()[:10]
    return h


def parse(text):
    title = "暗記カード"
    sections = []
    sec = None
    cur = None  # 現在のカード
    field = None  # "q" | "a" | "note"
    warnings = []

    def flush_card():
        nonlocal cur
        if cur is not None:
            cur["q"] = cur["q"].strip()
            cur["a"] = cur["a"].strip()
            if not cur["a"]:
                warnings.append(f"答えが無い問題: [{sec['title']}] {cur['q'][:40]}")
            sec["cards"].append(cur)
        cur = None

    for raw in text.splitlines():
        line = raw.rstrip()
        m1 = H1_RE.match(line)
        if m1 and not line.startswith("##"):
            title = m1.group(1)
            continue
        m2 = H2_RE.match(line)
        if m2:
            if sec:
                flush_card()
            sec = {"title": m2.group(1), "note": "", "cards": []}
            sections.append(sec)
            field = "note"
            continue
        if sec is None:
            continue
        mq = Q_RE.match(line)
        if mq:
            flush_card()
            label = mq.group(1).replace(" ", "")
            written = label.startswith("問")
            cur = {"label": label, "q": mq.group(2) + "\n", "a": "", "type": "written" if written else "qa"}
            field = "q"
            continue
        ma = A_RE.match(line)
        if ma and cur is not None:
            if any(k in ma.group(1) for k in WRITTEN_KEYS):
                cur["type"] = "written"
            cur["a"] += ma.group(2) + "\n"
            field = "a"
            continue
        if field == "note":
            sec["note"] += line + "\n"
        elif field in ("q", "a") and cur is not None:
            cur[field] += line + "\n"

    if sec:
        flush_card()

    out_sections = []
    seen = set()
    for i, s in enumerate(sections):
        if not s["cards"]:
            continue
        m = re.match(r"^(\d+)[.．、]\s*(.*)$", s["title"])
        num, name = (m.group(1), m.group(2)) if m else (str(i + 1), s["title"])
        short = re.sub(r"[（(]スライド[^）)]*[）)]", "", name).strip()
        cards = []
        for c in s["cards"]:
            cid = card_id(s["title"], c["q"])
            if cid in seen:
                cid = hashlib.sha1((s["title"] + c["q"]).encode()).hexdigest()[:10]
            seen.add(cid)
            cards.append({"id": cid, "label": c["label"], "type": c["type"], "q": c["q"], "a": c["a"]})
        out_sections.append({
            "id": "s" + num,
            "num": num,
            "title": name,
            "short": short,
            "note": s["note"].strip(),
            "written": all(c["type"] == "written" for c in cards),
            "cards": cards,
        })
    return {"title": title, "sections": out_sections}, warnings


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "source.md"
    text = src.read_text(encoding="utf-8-sig")
    data, warnings = parse(text)
    total = sum(len(s["cards"]) for s in data["sections"])
    if total == 0:
        sys.exit("エラー: 問題が1つも見つかりません。source.md の書式を確認してください。")
    data["version"] = hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]
    js = ("// このファイルは build.py が source.md から自動生成します。直接編集しないでください。\n"
          "window.QUIZ_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
    (ROOT / "data.js").write_text(js, encoding="utf-8")
    for w in warnings:
        print("警告:", w, file=sys.stderr)
    nw = sum(1 for s in data["sections"] for c in s["cards"] if c["type"] == "written")
    print(f"data.js を生成: {len(data['sections'])}節 / {total}問（うち記述 {nw}問）")
    for s in data["sections"]:
        print(f"  {s['num']:>3}. {s['short']}  ({len(s['cards'])}問)")


if __name__ == "__main__":
    main()
