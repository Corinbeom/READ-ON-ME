"""Rebuild selected NLCY field manifests from the hashed inventory and original CSV."""

import argparse
import csv
import hashlib
import html
import json
from pathlib import Path
import re

SOURCE = "https://www.data.go.kr/data/15151124/fileData.do"
SOURCE_SHA256 = "f4fb6ad3646cd4c6e309f63dceaa8cebfc06b5016c216674f892e56bda3681e3"
INVENTORY = Path(__file__).resolve().parent.parent / "librarian-inventory-20261126/inventory.tsv"


def approved_excerpt(raw, expected):
    # Reconstruct the prefix and verify it against the inventoried passage.
    text = " ".join(html.unescape(raw).split())
    prefix = re.split(r"""["'‘’“”「」〈〉《》『』<>]|\d+\s*쪽""", text)[0]
    sentences = []
    for match in re.finditer(r".+?[.!?](?=\s|$)", prefix):
        sentences.append(match[0].strip())
        excerpt = " ".join(sentences)
        if hashlib.sha256(excerpt.encode()).hexdigest() == expected:
            return excerpt
    raise ValueError("Source passage differs from the inventoried excerpt")


def prepare(source_csv, isbns):
    if hashlib.sha256(source_csv.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("Recommendation CSV differs from the inventoried snapshot")
    with source_csv.open(encoding="cp949", newline="") as f:
        catalog = dict(enumerate(csv.DictReader(f), start=2))
    fields = []
    pending = set(isbns)
    with INVENTORY.open(encoding="utf-8", newline="") as f:
        for entry in csv.DictReader(f, delimiter="\t"):
            isbn = entry["isbn"]
            if isbn not in pending or entry["source"] != "어린이·청소년" or entry["status"] != "신규 후보":
                continue
            item = catalog[int(entry["key"])]
            if (item["제목"], item["대상"]) != (entry["title"], entry["audience"]):
                raise ValueError(f"Edition mismatch for {isbn}")
            excerpt = approved_excerpt(item["내용"], entry["excerpt_sha256"])
            month = item["서사추천도서 추천 연월"][:7]
            credit = f"출처: 국립어린이청소년도서관 사서추천도서, {month} 추천글 발췌. 추천 대상: {item['대상']}. {SOURCE}"
            values = {"title": item["제목"], "authors": item["저자"], "contents": f"{excerpt}\n\n{credit}"}
            for field, value in values.items():
                fields.append(dict(isbn=isbn, field=field, value=value, provider="NLCY_LIBRARIAN_CSV",
                                   source_ref=f"{SOURCE}#row={entry['key']}", checked_on="2026-11-26",
                                   policy_version="2026-11-23"))
            pending.remove(isbn)
    if pending:
        raise ValueError(f"ISBNs outside the eligible inventory: {', '.join(sorted(pending))}")
    return fields


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_csv", type=Path)
    parser.add_argument("isbn", nargs="+")
    args = parser.parse_args()
    print(json.dumps(prepare(args.source_csv, args.isbn), ensure_ascii=False, indent=2))
