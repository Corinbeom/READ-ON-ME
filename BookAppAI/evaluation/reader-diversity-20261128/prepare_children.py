"""Reconstruct eligible librarian excerpts and exclude previously searchable editions."""

import argparse
import csv
import hashlib
import importlib.util
import json
from pathlib import Path

from app.services.corpus_quality import preflight_candidate

PREP = (
    Path(__file__).resolve().parents[1] / "librarian-pilot-20261126/prepare_fields.py"
)
spec = importlib.util.spec_from_file_location("librarian_pilot_fields", PREP)
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


def prepare(source, existing):
    with source.open("rb") as file:
        if hashlib.file_digest(file, "sha256").hexdigest() != pilot.SOURCE_SHA256:
            raise ValueError("Unexpected recommendation CSV revision")
    with source.open(encoding="cp949", newline="") as file:
        catalog = dict(enumerate(csv.DictReader(file), 2))
    result = []
    with pilot.INVENTORY.open(newline="") as file:
        for row in csv.DictReader(file, delimiter="\t"):
            isbn = row["isbn"]
            if (
                not isbn
                or isbn in existing
                or row["source"] != "어린이·청소년"
                or row["status"] != "신규 후보"
            ):
                continue
            entry = catalog[int(row["key"])]
            if (entry["제목"], entry["대상"]) != (row["title"], row["audience"]):
                raise ValueError("Catalog edition mismatch: " + isbn)
            excerpt = pilot.approved_excerpt(entry["내용"], row["excerpt_sha256"])
            values = {
                "title": entry["제목"],
                "authors": entry["저자"],
                "contents": excerpt,
            }
            if preflight_candidate(dict(isbn=isbn, **values)):
                continue
            month = entry["서사추천도서 추천 연월"][:7]
            values["contents"] += (
                f"\n\n출처: 국립어린이청소년도서관 사서추천도서, {month} 추천글 발췌. 추천 대상: {entry['대상']}. {pilot.SOURCE}"
            )
            result.extend(
                dict(
                    isbn=isbn,
                    field=k,
                    value=v,
                    provider="NLCY_LIBRARIAN_CSV",
                    source_ref=pilot.SOURCE + "#row=" + row["key"],
                    checked_on="2026-11-28",
                    policy_version="2026-11-23",
                )
                for k, v in values.items()
            )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument(
        "inventory",
        type=Path,
        help="Live inventory exported with tools.promote_reviewed",
    )
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    fields = prepare(
        args.source, set(json.loads(args.inventory.read_text())["editions"])
    )
    with args.output.open("x") as file:
        json.dump(fields, file, ensure_ascii=False)
    print(len(fields) // 3, "eligible editions")
