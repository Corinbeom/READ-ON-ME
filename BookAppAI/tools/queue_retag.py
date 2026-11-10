"""Preview or queue a small batch of low-quality corpus records for LLM retagging."""

import argparse
import asyncio

from dotenv import load_dotenv
from sqlalchemy import select

import app.database as database
from app.models.book_corpus import BookCorpus
from app.models.book_tagging_job import BookTaggingJob
from app.services.tagging_jobs import enqueue_tagging_jobs, requeue_failed_jobs


async def run(limit: int, apply: bool, retry_failed: bool = False) -> None:
    load_dotenv()
    database.init_db()
    try:
        async with database.async_session() as db:
            statement = select(BookCorpus.isbn, BookCorpus.title).join(
                BookTaggingJob, BookTaggingJob.isbn == BookCorpus.isbn, isouter=not retry_failed,
            )
            if retry_failed:
                statement = statement.where(BookTaggingJob.status == "FAILED")
            else:
                statement = statement.where(BookCorpus.keyword == "user_added", BookTaggingJob.isbn.is_(None))
            statement = statement.order_by(BookCorpus.created_at, BookCorpus.isbn).limit(limit)
            rows = (await db.execute(statement)).all()
            for isbn, title in rows:
                print(f"{isbn}\t{title}")
            if apply:
                if retry_failed:
                    await requeue_failed_jobs(db, [isbn for isbn, _ in rows])
                else:
                    await enqueue_tagging_jobs(db, [isbn for isbn, _ in rows])
            print(f"{'queued' if apply else 'preview'}={len(rows)}")
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--apply", action="store_true", help="Insert retry jobs; default is dry run")
    parser.add_argument("--retry-failed", action="store_true", help="Preview or reset FAILED jobs after fixing API errors")
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 100:
        parser.error("--limit must be between 1 and 100")
    asyncio.run(run(args.limit, args.apply, args.retry_failed))
