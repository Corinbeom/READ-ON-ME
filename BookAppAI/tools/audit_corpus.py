"""Review legacy corpus rows without changing recommendations by default."""

import argparse
import asyncio
import json
from collections import Counter
from pathlib import Path

from sqlalchemy import select

from app import database
from app.models.book_corpus import BookCorpus
from app.services.corpus_quality import preflight_candidate, validate_classification
from app.services.gemini_tagger import GeminiTagger


CLEAR_REJECT_REASONS = {"MULTI_BOOK_SET", "EDUCATIONAL_MATERIAL"}


async def audit(limit: int, after_id: int, output: Path, with_ai: bool, apply_ids: set[int], delay: float) -> None:
    database.init_db()
    tagger = GeminiTagger() if with_ai else None
    if with_ai and not tagger.enabled:
        raise RuntimeError("GEMINI_API_KEY is required with --with-ai")
    records = []
    async with database.async_session() as db:
        books = (await db.execute(
            select(BookCorpus).where(BookCorpus.id > after_id, BookCorpus.recommendation_status == "LEGACY")
            .order_by(BookCorpus.id).limit(limit)
        )).scalars().all()
        for book in books:
            data = {"isbn": book.isbn, "title": book.title, "authors": book.authors, "contents": book.contents}
            gate = preflight_candidate(data)
            proposed, reason = gate if gate else ("NEEDS_AI", None)
            classification = None
            if not gate and tagger:
                classification = await tagger.classify_book(book.title, book.contents or "", book.authors or "")
                if classification:
                    status, reason, keyword, tags = validate_classification(data, classification)
                    proposed = status
                else:
                    proposed, reason = "REVIEW", tagger.last_error_code or "CLASSIFIER_UNAVAILABLE"
                await asyncio.sleep(delay)
            applied = bool(book.id in apply_ids and proposed == "REJECTED" and reason in CLEAR_REJECT_REASONS)
            if applied:
                book.recommendation_status = "DISABLED"
            records.append({
                "id": book.id, "isbn": book.isbn, "title": book.title,
                "proposed_status": proposed, "reason": reason,
                "book_type": classification.get("book_type") if classification else None,
                "applied": applied,
            })
        if apply_ids:
            applied_ids = {row["id"] for row in records if row["applied"]}
            if applied_ids != apply_ids:
                raise ValueError(f"Selected IDs are missing or lack a clear rejection reason: {sorted(apply_ids - applied_ids)}")
            await db.commit()
    await database.engine.dispose()
    output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in records))
    print(json.dumps({"reviewed": len(records), "counts": dict(Counter(row["proposed_status"] for row in records)),
                      "disabled": sum(row["applied"] for row in records), "output": str(output)}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--after-id", type=int, default=0)
    parser.add_argument("--output", type=Path, default=Path("/tmp/readonme-corpus-audit.jsonl"))
    parser.add_argument("--with-ai", action="store_true")
    parser.add_argument("--apply-ids", help="Comma-separated book_corpus IDs to disable after reviewing a dry-run report")
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()
    if args.limit < 1 or args.delay < 0:
        parser.error("limit must be positive and delay nonnegative")
    try:
        apply_ids = {int(value.strip()) for value in args.apply_ids.split(",")} if args.apply_ids else set()
    except ValueError:
        parser.error("--apply-ids requires comma-separated integer IDs")
    if apply_ids and (len(apply_ids) > 20 or any(value < 1 for value in apply_ids)):
        parser.error("--apply-ids accepts 1–20 positive IDs at a time")
    asyncio.run(audit(args.limit, args.after_id, args.output, args.with_ai, apply_ids, args.delay))
