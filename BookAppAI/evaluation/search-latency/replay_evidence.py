"""Compare evidence response formats on archived reviewed results, without calling providers."""
import argparse
import json
import re
from collections import Counter
from pathlib import Path

from app.services.reranker import _book_evidence, _normalized_text


def encoded_size(selection):
    return len(json.dumps(selection, ensure_ascii=False, separators=(",", ":")).encode())


def compare(path):
    stats = Counter()
    for line in path.read_text().splitlines():
        row = json.loads(line)
        stats["questions"] += 1
        if not row["books"]:
            stats["empty_results"] += 1
        for number, book in enumerate(row["books"], 1):
            stats["books"] += 1
            if not book.get("reason_evidence") or not book.get("reason"):
                continue
            stats["grounded"] += 1
            quote = _normalized_text(book["reason_evidence"])
            sentences = re.split(r"(?<=[.!?。！？])\s+", _book_evidence(book))
            # Only exact reconstruction counts; never expand a partial quote to force a match.
            spans = [(i + 1, j + 1) for i in range(len(sentences)) for j in range(i, len(sentences))
                     if " ".join(sentences[i:j + 1]) == quote]
            if not spans:
                continue
            start, end = spans[0]
            stats["exact_span"] += 1
            stats["exact_single"] += int(start == end)
            # Keep the same synthetic book reference and reason in both representations.
            base = dict(isbn=f"B{number}", reason=book["reason"])
            stats["quote_bytes"] += encoded_size(dict(base, evidence_quote=quote))
            stats["reference_bytes"] += encoded_size(dict(base, evidence_sentences=list(range(start, end + 1))))
    return dict(stats)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runs", type=Path, nargs="+")
    for run in parser.parse_args().runs:
        print(run.name, json.dumps(compare(run)))
