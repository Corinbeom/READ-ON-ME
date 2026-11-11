"""Run a bounded live search sample and write a reviewable result file."""

import argparse
import asyncio
import json
import os
import time
import uuid
from pathlib import Path

import httpx

from app.services.text_utils import infer_book_form
from app.services.reranker import _normalized_text

DEFAULT_CASES = Path(__file__).parents[1] / "evaluation/golden_queries.json"


def _grounded_reason(book: dict) -> bool | None:
    reason = book.get("reason")
    evidence = book.get("reason_evidence")
    if not reason and not evidence:
        return None
    return bool(reason and evidence and evidence in _normalized_text(book.get("contents") or ""))


async def run(url: str, cases: list[dict], limit: int, delay: float, output: Path) -> None:
    headers = {}
    if token := os.getenv("INTERNAL_API_TOKEN"):
        headers["X-Internal-Token"] = token
    records = []
    async with httpx.AsyncClient(timeout=70, headers=headers) as client:
        for index, case in enumerate(cases[:limit]):
            request_id = f"evaluation-{index + 1}-{uuid.uuid4().hex[:8]}"
            started = time.perf_counter()
            response = await client.post(
                f"{url.rstrip('/')}/api/ai/search",
                json={"query": case["query"]},
                headers={"X-Request-ID": request_id},
            )
            response.raise_for_status()
            books = response.json()
            author = case.get("focus_author")
            reference_author = case.get("reference_author")
            forbidden_titles = case.get("forbidden_titles", [])
            records.append({
                "request_id": request_id,
                "latency_ms": round((time.perf_counter() - started) * 1000, 1),
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
                    "contents_excerpt": _normalized_text(book.get("contents") or "")[:240],
                    "ranking_status": book.get("ranking_status"), "reason": book.get("reason"),
                    "reason_evidence": book.get("reason_evidence"),
                    "grounded_reason": _grounded_reason(book),
                    "human_relevance_1_to_5": None,
                    "human_note": None,
                } for book in books],
                "human_query_note": None,
            })
            output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
            if index + 1 < limit:
                await asyncio.sleep(delay)
    print(f"evaluated={len(records)} empty={sum(not row['returned'] for row in records)} output={output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--delay", type=float, default=6.0)
    parser.add_argument("--output", type=Path, default=Path("/tmp/readonme-search-evaluation.json"))
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    args = parser.parse_args()
    cases = json.loads(args.cases.read_text())
    if not 1 <= args.limit <= len(cases) or args.delay < 0:
        parser.error("limit must be within the case count and delay must be nonnegative")
    asyncio.run(run(args.url, cases, args.limit, args.delay, args.output))
