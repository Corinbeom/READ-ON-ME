"""Measure local search stages without changing the production API response."""

import argparse
import asyncio
import json
import time
import uuid
from pathlib import Path

from sqlalchemy import select

from app import database
from app.models.book_corpus import BookCorpus
from app.services import book_ai_service, reranker


DEFAULT_CASES = Path(__file__).parents[1] / "evaluation/representative_queries.json"
STAGES = ("retrieved", "filtered", "model_input", "model_selected", "fallback", "result")


async def _status_counts(db, diagnostics: dict) -> dict:
    isbns = set().union(*(diagnostics.get(f"{stage}_isbns", []) for stage in STAGES))
    statuses = dict((await db.execute(
        select(BookCorpus.isbn, BookCorpus.recommendation_status).where(BookCorpus.isbn.in_(isbns))
    )).all()) if isbns else {}
    return {
        stage: {
            "total": len(stage_isbns),
            "ACTIVE": sum(statuses.get(isbn) == "ACTIVE" for isbn in stage_isbns),
            "LEGACY": sum(statuses.get(isbn) == "LEGACY" for isbn in stage_isbns),
            "other": sum(statuses.get(isbn) not in {"ACTIVE", "LEGACY"} for isbn in stage_isbns),
        }
        for stage in STAGES
        for stage_isbns in [diagnostics.get(f"{stage}_isbns", [])]
    }


async def run(cases: list[dict], limit: int, delay: float, output: Path) -> None:
    if not reranker.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is required to measure model reason coverage")
    database.init_db()
    records = []
    try:
        await book_ai_service.init_embedding_model()
        async with database.async_session() as db:
            for index, case in enumerate(cases[:limit]):
                request_id = f"stage-audit-{index + 1}-{uuid.uuid4().hex[:8]}"
                started = time.perf_counter()
                outcome, diagnostics = {}, {}
                record = {"query": case["query"], "request_id": request_id}
                try:
                    books = await book_ai_service.search_by_natural_language(
                        case["query"], db, request_id=request_id,
                        outcome=outcome, diagnostics=diagnostics,
                    )
                    record.update(
                        outcome=outcome,
                        stages=await _status_counts(db, diagnostics),
                        filtered_isbns=diagnostics.get("filtered_isbns", []),
                        model_input_isbns=diagnostics.get("model_input_isbns", []),
                        reason_rejections=diagnostics.get("reason_rejections", []),
                        books=[{
                            "isbn": book.get("isbn"), "title": book.get("title"),
                            "ranking_status": book.get("ranking_status"),
                            "has_reason": bool(book.get("reason")),
                        } for book in books],
                    )
                except Exception as exc:
                    record["error_type"] = type(exc).__name__
                record["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
                records.append(record)
                output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
                if index + 1 < limit:
                    await asyncio.sleep(delay)
    finally:
        if database.engine is not None:
            await database.engine.dispose()
        book_ai_service.shutdown_embedding_model()
    print(f"audited={len(records)} errors={sum('error_type' in row for row in records)} output={output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--delay", type=float, default=6.0)
    parser.add_argument("--output", type=Path, default=Path("/tmp/readonme-search-stages.json"))
    args = parser.parse_args()
    cases = json.loads(args.cases.read_text())
    if not 1 <= args.limit <= len(cases) or args.delay < 0:
        parser.error("limit must be within the case count and delay must be nonnegative")
    asyncio.run(run(cases, args.limit, args.delay, args.output))
