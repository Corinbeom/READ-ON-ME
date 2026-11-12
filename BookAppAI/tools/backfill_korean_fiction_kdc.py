"""Fill ISBN-verified KDC classifications for searchable fiction candidates.

Dry-run by default. --apply persists each lookup and can be resumed. No Gemini
or local embedding calls are made.
"""

import argparse
import asyncio
import os
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, update

from app import database
from app.models.book_corpus import BookCorpus
from app.services.corpus_metadata import fetch_naru_kdc
from app.services.text_utils import is_search_candidate


def _fiction_candidate(book: BookCorpus) -> bool:
    return is_search_candidate({
        "title": book.title, "contents": book.contents, "authors": book.authors,
        "keyword": book.keyword, "tags": book.tags,
    }, genre="소설", requested_form="STORY")


async def run(*, apply: bool, limit: int, pace: float, retry_missing: bool) -> None:
    if apply and not os.getenv("LIBRARY_BIGDATA_API_KEY"):
        raise RuntimeError("LIBRARY_BIGDATA_API_KEY is required for KDC backfill")
    database.init_db()
    try:
        async with database.async_session() as db:
            books = (await db.execute(select(BookCorpus).where(
                BookCorpus.recommendation_status.in_(("ACTIVE", "LEGACY")),
            ).order_by(BookCorpus.id))).scalars().all()
        fiction = [book for book in books if _fiction_candidate(book)]
        pending = [book for book in fiction if book.kdc_checked_at is None or (
            retry_missing and book.kdc_code is None
        )]
        selected = pending[:limit]
        print(f"searchable={len(books)} fiction={len(fiction)} pending={len(pending)} selected={len(selected)} apply={apply}", flush=True)
        if not apply:
            return
        found = korean = foreign = errors = consecutive_errors = 0
        for index, book in enumerate(selected, 1):
            try:
                code = await fetch_naru_kdc(book.isbn, raise_on_error=True)
            except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
                errors += 1
                consecutive_errors += 1
                print(f"lookup_error id={book.id} type={type(exc).__name__}; left pending", flush=True)
                if consecutive_errors >= 3:
                    raise RuntimeError("Three consecutive Naru lookup errors; backfill stopped") from None
                await asyncio.sleep(max(pace, 1.0))
                continue
            consecutive_errors = 0
            found += bool(code)
            korean += bool(code and code.startswith("813"))
            foreign += bool(code and code.startswith("8") and not code.startswith("813"))
            async with database.async_session() as db:
                await db.execute(update(BookCorpus).where(
                    BookCorpus.id == book.id,
                    BookCorpus.isbn == book.isbn,
                ).values(
                    kdc_code=code,
                    kdc_source="DATA4LIBRARY" if code else None,
                    kdc_checked_at=datetime.now(timezone.utc),
                ))
                await db.commit()
            if index % 25 == 0 or index == len(selected):
                print(f"done={index}/{len(selected)} found={found} korean_813={korean} other_literature={foreign} errors={errors}", flush=True)
            if index < len(selected):
                await asyncio.sleep(pace)
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=300)
    parser.add_argument("--pace", type=float, default=0.5)
    parser.add_argument("--retry-missing", action="store_true")
    args = parser.parse_args()
    if args.limit < 1 or args.pace < 0:
        parser.error("limit must be positive and pace nonnegative")
    asyncio.run(run(apply=args.apply, limit=args.limit, pace=args.pace, retry_missing=args.retry_missing))
