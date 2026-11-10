"""Run a bounded live search sample and write a reviewable result file."""

import argparse
import asyncio
import json
import os
from pathlib import Path

import httpx

from app.services.text_utils import infer_book_form
from app.services.reranker import _normalized_text

DEFAULT_CASES = Path(__file__).parents[1] / "evaluation/golden_queries.json"


async def run(url: str, cases: list[dict], limit: int, delay: float, output: Path) -> None:
    headers = {}
    if token := os.getenv("INTERNAL_API_TOKEN"):
        headers["X-Internal-Token"] = token
    records = []
    async with httpx.AsyncClient(timeout=70, headers=headers) as client:
        for index, case in enumerate(cases[:limit]):
            response = await client.post(f"{url.rstrip('/')}/api/ai/search", json={"query": case["query"]})
            response.raise_for_status()
            books = response.json()
            author = case.get("focus_author")
            reference_author = case.get("reference_author")
            forbidden_titles = case.get("forbidden_titles", [])
            records.append({
                "query": case["query"],
                "expected": {key: value for key, value in case.items() if key != "query"},
                "returned": len(books),
                "author_constraint_ok": all(
                    author.replace(" ", "") in (book.get("authors") or "").replace(" ", "")
                    for book in books
                ) if author else None,
                "reference_author_excluded": all(
                    reference_author.replace(" ", "") not in (book.get("authors") or "").replace(" ", "")
                    for book in books
                ) if reference_author else None,
                "forbidden_title_hits": [
                    book.get("title") for book in books
                    if any(title in (book.get("title") or "") for title in forbidden_titles)
                ],
                "story_form_mismatches": [
                    book.get("title") for book in books
                    if case.get("requested_form") == "STORY"
                    and infer_book_form(book.get("title") or "", book.get("contents") or "") == "PRACTICAL"
                ],
                "books": [{
                    "isbn": book.get("isbn"), "title": book.get("title"), "authors": book.get("authors"),
                    "ranking_status": book.get("ranking_status"), "reason": book.get("reason"),
                    "reason_evidence": book.get("reason_evidence"),
                    "grounded_reason": bool(book.get("reason") and book.get("reason_evidence")
                                             and book["reason_evidence"] in _normalized_text(book.get("contents") or "")),
                } for book in books],
                "human_relevance_1_to_5": None,
            })
            if index + 1 < limit:
                await asyncio.sleep(delay)
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
    print(f"evaluated={len(records)} empty={sum(not row['returned'] for row in records)} output={output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--output", type=Path, default=Path("/tmp/readonme-search-evaluation.json"))
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    args = parser.parse_args()
    cases = json.loads(args.cases.read_text())
    if not 1 <= args.limit <= len(cases) or args.delay < 0:
        parser.error("limit must be within the case count and delay must be nonnegative")
    asyncio.run(run(args.url, cases, args.limit, args.delay, args.output))
