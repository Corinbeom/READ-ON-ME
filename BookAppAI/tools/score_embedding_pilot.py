"""Validate manual relevance labels and score changed Gemini pilot candidates."""

import argparse
import json
from collections import Counter
from pathlib import Path


DEFAULT_RESULTS = Path(__file__).parents[1] / "evaluation/gemini_embedding_pilot_candidates_2026-11-12.json"
DEFAULT_LABELS = Path(__file__).parents[1] / "evaluation/gemini_embedding_pilot_labels_2026-11-12.json"
DEFAULT_OUTPUT = Path("/tmp/readonme-gemini-embedding-pilot-relevance.json")


def score(results: dict, labels: dict) -> dict:
    cases = {case["query"]: case for case in results["results"]}
    judgments = {case["query"]: case for case in labels["cases"]}
    if set(cases) != set(judgments) or len(cases) != len(results["results"]) or len(judgments) != len(labels["cases"]):
        raise ValueError("Pilot and label queries must match exactly")
    totals = {"local_only": Counter(), "gemini_only": Counter()}
    per_query = []
    for query, case in cases.items():
        local = {book["isbn"] for book in case["local"]["model_input"]}
        gemini = {book["isbn"] for book in case["gemini"]["model_input"]}
        changed = local ^ gemini
        rows = judgments[query]["labels"]
        judged = {row["isbn"]: row for row in rows}
        if len(judged) != len(rows) or set(judged) != changed:
            raise ValueError(f"Missing, duplicate, or extra ratings for {query}")
        if any(row["rating"] not in {0, 1, 2} or not row.get("reason") for row in rows):
            raise ValueError(f"Invalid rating or missing reason for {query}")
        counts = {}
        for name, isbns in (("local_only", local - gemini), ("gemini_only", gemini - local)):
            counts[name] = {str(rating): sum(judged[isbn]["rating"] == rating for isbn in isbns)
                            for rating in (0, 1, 2)}
            totals[name].update(judged[isbn]["rating"] for isbn in isbns)
        per_query.append({"query": query, "shared": len(local & gemini), **counts})
    return {
        "scope": "Only candidates unique to one model input; shared candidates cancel in the paired comparison.",
        "total_changed": sum(sum(counter.values()) for counter in totals.values()),
        "totals": {name: {str(rating): counter[rating] for rating in (0, 1, 2)}
                   for name, counter in totals.items()},
        "per_query": per_query,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--labels", type=Path, default=DEFAULT_LABELS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    result = score(json.loads(args.results.read_text()), json.loads(args.labels.read_text()))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"changed={result['total_changed']} totals={result['totals']} output={args.output}")
