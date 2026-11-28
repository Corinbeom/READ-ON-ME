"""Build field manifests from matching holdings. Catalog subject terms remain labeled."""

import argparse
import json
from pathlib import Path

from app.services.corpus_quality import preflight_candidate
from holdings import SOURCE


def prepare(verified, excluded):
    fields = []
    for isbn, book in verified.items():
        if isbn in excluded:
            continue
        if not book.get("first") or not book.get("second"):
            raise ValueError("Missing holdings reference for " + isbn)
        values = {
            "title": book["title"],
            "authors": book["authors"],
            "contents": book["subtitle"]
            + "\n도서관 주제어: "
            + ", ".join(book["terms"]),
        }
        if preflight_candidate(dict(isbn=isbn, **values)):
            continue
        values["contents"] += (
            "\n\n출처: 성남시 판교도서관 장서목록. 부제 및 서지 주제어."
        )
        fields.extend(
            dict(
                isbn=isbn,
                field=k,
                value=v,
                provider="SEONGNAM_HOLDINGS_BIB",
                checked_on="2026-11-28",
                policy_version="2026-11-28",
                source_ref=SOURCE + "#" + book["first"],
            )
            for k, v in values.items()
        )
    return fields


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("holdings", type=Path)
    parser.add_argument(
        "excluded", type=Path, help="JSON list of previously selected or existing ISBNs"
    )
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    records = prepare(
        json.loads(args.holdings.read_text()),
        set(json.loads(args.excluded.read_text())),
    )
    with args.output.open("x") as f:
        json.dump(records, f, ensure_ascii=False)
    print(len(records) // 3, "eligible editions")
