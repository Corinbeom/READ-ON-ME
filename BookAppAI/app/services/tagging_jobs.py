import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

import app.database as database
from app.models.book_corpus import BookCorpus
from app.models.book_tagging_job import BookTaggingJob
from app.services import llm_cooldown
from app.services.book_classifier import BookClassifier
from app.services.gemini_tagger import GeminiTagger


logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 3
POLL_SECONDS = 30
STALE_AFTER = timedelta(minutes=2)
MODEL_VERSION = os.getenv("GEMINI_DETAILED_MODEL", "gemini-3.5-flash-lite")


def retry_delay(attempts: int) -> timedelta:
    return timedelta(seconds=min(3600, 60 * 2 ** max(0, attempts - 1)))


def failure_retry_policy(attempts: int, error_code: str) -> tuple[str, timedelta]:
    if error_code == "RATE_LIMIT":
        return "RETRY", max(retry_delay(attempts), timedelta(minutes=5))
    if error_code == "AUTH_ERROR":
        return "FAILED", retry_delay(attempts)
    return ("FAILED" if attempts >= MAX_ATTEMPTS else "RETRY"), retry_delay(attempts)


async def enqueue_tagging_jobs(db: AsyncSession, isbns: list[str], *, commit: bool = True) -> None:
    unique_isbns = list(dict.fromkeys(isbn for isbn in isbns if isbn))
    if not unique_isbns:
        return
    now = datetime.now(timezone.utc)
    statement = insert(BookTaggingJob).values([
        {
            "isbn": isbn,
            "status": "PENDING",
            "attempts": 0,
            "next_attempt_at": now,
            "model_version": MODEL_VERSION,
        }
        for isbn in unique_isbns
    ]).on_conflict_do_nothing(index_elements=["isbn"])
    await db.execute(statement)
    if commit:
        await db.commit()


async def requeue_failed_jobs(db: AsyncSession, isbns: list[str]) -> int:
    unique_isbns = list(dict.fromkeys(isbn for isbn in isbns if isbn))
    if not unique_isbns:
        return 0
    result = await db.execute(
        update(BookTaggingJob)
        .where(BookTaggingJob.isbn.in_(unique_isbns), BookTaggingJob.status == "FAILED")
        .values(
            status="PENDING", attempts=0, next_attempt_at=datetime.now(timezone.utc),
            model_version=MODEL_VERSION, last_error_code=None, updated_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
    return result.rowcount


async def recover_interrupted_jobs() -> None:
    async with database.async_session() as db:
        await db.execute(
            update(BookTaggingJob)
            .where(BookTaggingJob.status == "RUNNING", BookTaggingJob.updated_at <= datetime.now(timezone.utc) - STALE_AFTER)
            .values(status="RETRY", next_attempt_at=datetime.now(timezone.utc), last_error_code="INTERRUPTED")
        )
        await db.commit()


async def _claim_due_job() -> str | None:
    async with database.async_session() as db:
        async with db.begin():
            job = (await db.execute(
                select(BookTaggingJob)
                .where(BookTaggingJob.status.in_(["PENDING", "RETRY"]))
                .where(BookTaggingJob.next_attempt_at <= datetime.now(timezone.utc))
                .order_by(BookTaggingJob.next_attempt_at, BookTaggingJob.created_at)
                .with_for_update(skip_locked=True)
                .limit(1)
            )).scalar_one_or_none()
            if job is None:
                return None
            job.status = "RUNNING"
            job.attempts += 1
            job.updated_at = datetime.now(timezone.utc)
            return job.isbn


async def _process_job(isbn: str, classifier: BookClassifier) -> None:
    async with database.async_session() as db:
        book = (await db.execute(select(BookCorpus).where(BookCorpus.isbn == isbn))).scalar_one_or_none()
        job = (await db.execute(select(BookTaggingJob).where(BookTaggingJob.isbn == isbn))).scalar_one()
        if book is None:
            job.status = "FAILED"
            job.last_error_code = "BOOK_MISSING"
        else:
            classification = await classifier.classify(book.title, book.contents or "", book.authors or "")
            if classification.used_llm and classification.primary_keyword:
                book.keyword = classification.primary_keyword
                book.tags = list(dict.fromkeys([classification.primary_keyword, *classification.tags]))
                job.status = "DONE"
                job.last_error_code = None
            else:
                error_code = getattr(classifier.llm_tagger, "last_error_code", None) or "TAGGING_UNAVAILABLE"
                job.status, delay = failure_retry_policy(job.attempts, error_code)
                job.next_attempt_at = datetime.now(timezone.utc) + delay
                job.last_error_code = error_code
        job.updated_at = datetime.now(timezone.utc)
        await db.commit()


async def _mark_failed_attempt(isbn: str) -> None:
    async with database.async_session() as db:
        job = (await db.execute(select(BookTaggingJob).where(BookTaggingJob.isbn == isbn))).scalar_one_or_none()
        if job is None or job.status != "RUNNING":
            return
        job.status = "FAILED" if job.attempts >= MAX_ATTEMPTS else "RETRY"
        job.next_attempt_at = datetime.now(timezone.utc) + retry_delay(job.attempts)
        job.last_error_code = "WORKER_ERROR"
        await db.commit()


async def run_worker(stop: asyncio.Event) -> None:
    classifier = BookClassifier(llm_tagger=GeminiTagger(model_name=MODEL_VERSION))
    while not stop.is_set():
        isbn = None
        try:
            await recover_interrupted_jobs()
            if llm_cooldown.available() and classifier.llm_tagger.enabled:
                isbn = await _claim_due_job()
                if isbn:
                    await _process_job(isbn, classifier)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Tagging worker failed error=%s", type(exc).__name__)
            if isbn:
                try:
                    await _mark_failed_attempt(isbn)
                except Exception:
                    logger.exception("Could not record tagging failure")
        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_SECONDS)
        except asyncio.TimeoutError:
            pass
