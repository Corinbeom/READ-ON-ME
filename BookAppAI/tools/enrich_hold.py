"""Preview or requeue one SHORT_DESCRIPTION HOLD using verified library metadata."""

import argparse
import asyncio

from dotenv import load_dotenv

import app.database as database
from app.models.corpus_ingestion_job import CorpusIngestionJob
from app.services.corpus_ingestion import enqueue_book
from app.services.corpus_metadata import fetch_naru_description


async def run(job_id: str, apply: bool) -> None:
    load_dotenv()
    database.init_db()
    try:
        async with database.async_session() as db:
            job = await db.get(CorpusIngestionJob, job_id)
            if not job or job.job_type != "BOOK" or job.status != "HOLD" or job.reject_reason != "SHORT_DESCRIPTION":
                print("result=NOT_SHORT_DESCRIPTION_HOLD")
                return
            old_book = dict(job.payload["book"])
            source, run_id, isbn = job.source, job.run_id, job.isbn

        description = await fetch_naru_description(isbn)
        old_length = len(str(old_book.get("contents") or ""))
        new_length = len(description or "")
        print(f"isbn={isbn} current_length={old_length} source_length={new_length}")
        if not description or new_length <= old_length:
            print("result=NO_RICHER_DESCRIPTION")
            return
        if not apply:
            print("result=PREVIEW")
            return

        async with database.async_session() as db:
            job = await db.get(CorpusIngestionJob, job_id)
            if not job or job.status != "HOLD" or job.reject_reason != "SHORT_DESCRIPTION":
                print("result=STATUS_CHANGED")
                return
            status, queued = await enqueue_book(
                db, {**old_book, "contents": description}, source=source, run_id=run_id,
                commit=False,
            )
            if status != "QUEUED" or queued.id != job_id:
                print(f"result={status}")
                return
            queued.payload = {**queued.payload, "contents_source": "DATA4LIBRARY"}
            await db.commit()
            print("result=QUEUED")
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--apply", action="store_true", help="Requeue the selected HOLD; default is preview")
    args = parser.parse_args()
    asyncio.run(run(args.job_id, args.apply))
