"""Durable, bounded ingestion for Kakao discoveries and user-added books."""

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import case, func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

import app.database as database
from app.models.book_corpus import BookCorpus
from app.models.corpus_ingestion_job import CorpusIngestionJob
from app.services import llm_cooldown
from app.services.corpus_quality import normalize_isbn, preflight_candidate, validate_classification
from app.services.gemini_tagger import GeminiTagger
from app.services.text_utils import build_book_text, build_keyword_prompt, format_authors, get_proxy_search_terms


logger = logging.getLogger(__name__)
POLL_SECONDS = 3
PAGE_SIZE = 20
MAX_PAGES_PER_TERM = 5
STALE_AFTER = timedelta(minutes=3)
MAX_ATTEMPTS = 3
KAKAO_URL = "https://dapi.kakao.com/v3/search/book"
SIMILARITY_GATE = float(os.getenv("CORPUS_SIMILARITY_THRESHOLD", "0.45"))
_keyword_embeddings: dict[str, list[float]] = {}
corpus_tagger = GeminiTagger()
_BATCH_CREATE_LOCK = 741906
_WORKER_LOCK = 741905


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _public_job(job: CorpusIngestionJob, candidate_counts: dict[str, int] | None = None) -> dict:
    return {
        "id": job.id, "type": job.job_type, "source": job.source, "isbn": job.isbn,
        "status": job.status, "progress": job.progress, "attempts": job.attempts,
        "error_code": job.error_code, "reject_reason": job.reject_reason,
        "candidate_counts": candidate_counts or {},
    }


async def create_batch_job(db: AsyncSession, keywords: list[str]) -> CorpusIngestionJob:
    clean = list(dict.fromkeys(term.strip() for term in keywords if isinstance(term, str) and term.strip()))
    if not clean or len(clean) > 20 or any(len(term) > 40 for term in clean):
        raise ValueError("Provide 1–20 keywords, each at most 40 characters")
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _BATCH_CREATE_LOCK})
    active = (await db.execute(select(CorpusIngestionJob).where(
        CorpusIngestionJob.job_type == "BATCH",
        CorpusIngestionJob.status.in_(["PENDING", "RUNNING", "RETRY"]),
    ).order_by(CorpusIngestionJob.created_at).limit(1))).scalar_one_or_none()
    if active:
        if active.payload.get("keywords") == clean:
            return active
        raise BatchAlreadyRunning(active.id)
    job = CorpusIngestionJob(
        id=str(uuid.uuid4()), job_type="BATCH", source="KAKAO_BATCH", status="PENDING",
        payload={"keywords": clean}, progress={"term_index": 0, "page": 1, "fetched": 0, "queued": 0, "duplicates": 0, "invalid_isbn": 0},
        next_attempt_at=_now(),
    )
    db.add(job)
    await db.commit()
    return job


async def enqueue_book(
    db: AsyncSession, book: dict[str, Any], *, source: str, run_id: str | None = None,
    discovery_keyword: str | None = None, commit: bool = True,
    known_corpus_isbns: set[str] | None = None,
) -> tuple[str, CorpusIngestionJob | None]:
    if source == "KAKAO_BATCH" and not run_id:
        raise ValueError("Kakao batch candidates require a run ID")
    isbn = normalize_isbn(str(book.get("isbn") or ""))
    if not isbn:
        return "INVALID_ISBN", None
    if known_corpus_isbns is not None and isbn in known_corpus_isbns:
        return "ALREADY_INDEXED", None
    if known_corpus_isbns is None:
        existing_corpus = (await db.execute(select(BookCorpus.id).where(BookCorpus.isbn == isbn))).scalar_one_or_none()
        if existing_corpus is not None:
            return "ALREADY_INDEXED", None
    book = {**book, "isbn": isbn}
    book["authors"] = format_authors(book.get("authors"))
    payload = {"book": book, "discovery_keywords": [discovery_keyword] if discovery_keyword else []}
    job_id = str(uuid.uuid4())
    created = (await db.execute(
        insert(CorpusIngestionJob).values(
            id=job_id, job_type="BOOK", source=source, isbn=isbn, run_id=run_id,
            status="PENDING", payload=payload, progress={}, attempts=0, next_attempt_at=_now(),
        ).on_conflict_do_nothing()
        .returning(CorpusIngestionJob.id)
    )).scalar_one_or_none()
    job = (await db.execute(select(CorpusIngestionJob).where(
        CorpusIngestionJob.id == created if created else CorpusIngestionJob.isbn == isbn,
        CorpusIngestionJob.job_type == "BOOK",
        CorpusIngestionJob.source == source,
        CorpusIngestionJob.run_id == run_id,
    ))).scalar_one()
    requeued = False
    if not created:
        old_payload = dict(job.payload or {})
        old_book = old_payload.get("book") or {}
        old_keywords = old_payload.get("discovery_keywords") or []
        keywords = list(dict.fromkeys([*old_keywords, *(payload["discovery_keywords"])]))
        better_description = len(str(book.get("contents") or "")) > len(str(old_book.get("contents") or ""))
        new_topic = bool(discovery_keyword and discovery_keyword not in old_keywords)
        requeued = job.status in {"FAILED", "HOLD", "REJECTED"} and (
            better_description or source == "USER_LIBRARY"
            or (job.reject_reason == "LOW_TOPIC_SIMILARITY" and new_topic)
        )
        if requeued:
            chosen_book = book if source == "USER_LIBRARY" or better_description else old_book
            job.payload = {"book": chosen_book, "discovery_keywords": keywords}
            job.status = "PENDING"
            job.attempts = 0
            job.error_code = None
            job.reject_reason = None
            job.next_attempt_at = _now()
        elif keywords != old_payload.get("discovery_keywords", []):
            job.payload = {**old_payload, "discovery_keywords": keywords}
    if commit:
        await db.commit()
    return ("QUEUED" if created or requeued else job.status), job


async def get_job(db: AsyncSession, job_id: str) -> dict | None:
    job = await db.get(CorpusIngestionJob, job_id)
    if job is None:
        return None
    candidate_counts = {}
    if job.job_type == "BATCH":
        rows = (await db.execute(select(CorpusIngestionJob.status, func.count()).where(
            CorpusIngestionJob.run_id == job.id,
        ).group_by(CorpusIngestionJob.status))).all()
        candidate_counts = dict(rows)
    return _public_job(job, candidate_counts)


async def _fetch_kakao_page(term: str, page: int) -> tuple[list[dict], bool]:
    api_key = os.getenv("KAKAO_API_KEY", "")
    if not api_key:
        raise IngestionFailure("KAKAO_AUTH_ERROR", retryable=False)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=3.0)) as client:
            response = await client.get(
                KAKAO_URL, headers={"Authorization": f"KakaoAK {api_key}"},
                params={"query": term, "page": page, "size": PAGE_SIZE},
            )
            response.raise_for_status()
            body = response.json()
            return body.get("documents") or [], bool((body.get("meta") or {}).get("is_end"))
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        raise IngestionFailure("KAKAO_RATE_LIMIT" if status == 429 else "KAKAO_AUTH_ERROR" if status in (401, 403) else "KAKAO_UPSTREAM_ERROR", retryable=status not in (401, 403)) from None
    except (httpx.RequestError, ValueError) as exc:
        raise IngestionFailure("KAKAO_REQUEST_ERROR") from exc


class IngestionFailure(Exception):
    def __init__(self, code: str, *, retryable: bool = True):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class BatchAlreadyRunning(Exception):
    def __init__(self, run_id: str):
        super().__init__(run_id)
        self.run_id = run_id


async def _process_batch(job_id: str) -> None:
    async with database.async_session() as db:
        job = await db.get(CorpusIngestionJob, job_id)
        keywords = job.payload["keywords"]
        progress = dict(job.progress)
    terms = [(keyword, term) for keyword in keywords for term in get_proxy_search_terms(keyword)]
    index = int(progress.get("term_index", 0))
    page = int(progress.get("page", 1))
    if index >= len(terms):
        async with database.async_session() as db:
            job = await db.get(CorpusIngestionJob, job_id)
            job.status = "DONE"
            job.updated_at = _now()
            await db.commit()
        return
    keyword, term = terms[index]
    documents, is_end = await _fetch_kakao_page(term, page)
    async with database.async_session() as db:
        job = await db.get(CorpusIngestionJob, job_id)
        progress = dict(job.progress)
        progress["fetched"] += len(documents)
        isbns = {isbn for book in documents if (isbn := normalize_isbn(str(book.get("isbn") or "")))}
        known_corpus_isbns = set((await db.execute(
            select(BookCorpus.isbn).where(BookCorpus.isbn.in_(isbns))
        )).scalars().all()) if isbns else set()
        for book in documents:
            status, _ = await enqueue_book(db, book, source="KAKAO_BATCH", run_id=job_id, discovery_keyword=keyword, commit=False, known_corpus_isbns=known_corpus_isbns)
            key = "invalid_isbn" if status == "INVALID_ISBN" else "duplicates" if status in {"ALREADY_INDEXED", "INDEXED", "RUNNING", "PENDING", "RETRY", "HOLD", "REJECTED", "FAILED"} else "queued"
            progress[key] += 1
        if is_end or not documents or page >= MAX_PAGES_PER_TERM:
            progress["term_index"] = index + 1
            progress["page"] = 1
        else:
            progress["page"] = page + 1
        job.progress = progress
        job.status = "DONE" if progress["term_index"] >= len(terms) else "PENDING"
        job.attempts = 0
        job.error_code = None
        job.next_attempt_at = _now() + timedelta(seconds=2)
        job.updated_at = _now()
        await db.commit()


async def _keyword_vector(keyword: str) -> list[float] | None:
    if keyword not in _keyword_embeddings:
        from app.services.book_ai_service import get_embedding
        vector = await get_embedding(build_keyword_prompt(keyword))
        if vector:
            _keyword_embeddings[keyword] = vector
    return _keyword_embeddings.get(keyword)


async def _finish_book(job_id: str, status: str, reason: str | None = None, *, embedding=None, classification=None, classification_result=None, similarity=0.0) -> None:
    async with database.async_session() as db:
        job = await db.get(CorpusIngestionJob, job_id)
        if status == "ACTIVE":
            book = job.payload["book"]
            await db.execute(insert(BookCorpus).values(
                title=book["title"], contents=book.get("contents"), isbn=job.isbn,
                authors=format_authors(book.get("authors")), publisher=book.get("publisher"),
                thumbnail=book.get("thumbnail"), keyword=classification[0], tags=classification[1],
                similarity_score=similarity, embedding=embedding, recommendation_status="ACTIVE",
                source=job.source, classification_version=corpus_tagger.model,
                validated_at=_now(),
            ).on_conflict_do_nothing(index_elements=["isbn"]))
            job.status = "INDEXED"
        else:
            job.status = status
        if classification_result:
            job.progress = {
                "book_type": classification_result.get("book_type"),
                "evidence_quote": classification_result.get("evidence_quote"),
                "topic_similarity": round(similarity, 4) if job.source == "KAKAO_BATCH" else None,
            }
        job.reject_reason = reason
        job.error_code = None
        job.updated_at = _now()
        await db.commit()


async def _process_book(job_id: str) -> None:
    from app.services import book_ai_service as svc

    async with database.async_session() as db:
        job = await db.get(CorpusIngestionJob, job_id)
        book = dict(job.payload["book"])
        keywords = list(job.payload.get("discovery_keywords") or [])
        source = job.source
        isbn = job.isbn
    gate = preflight_candidate(book)
    if gate:
        await _finish_book(job_id, *gate)
        return
    async with database.async_session() as db:
        existing = (await db.execute(select(BookCorpus.id).where(BookCorpus.isbn == isbn))).scalar_one_or_none()
        if existing is not None:
            await _finish_book(job_id, "INDEXED")
            return
        similar = await svc.find_similar_corpus_edition(db, book.get("title") or "", format_authors(book.get("authors")))
        if similar:
            await _finish_book(job_id, "REJECTED", "DUPLICATE_EDITION")
            return
    embedding = await svc.get_embedding(build_book_text(book["title"], book["contents"], book.get("authors")))
    if not embedding:
        raise IngestionFailure("EMBEDDING_UNAVAILABLE")
    similarity = 0.0
    if source == "KAKAO_BATCH":
        scores = []
        for keyword in keywords:
            vector = await _keyword_vector(keyword)
            if vector:
                scores.append(float(svc.cosine_similarity(vector, embedding)))
        if not scores:
            raise IngestionFailure("KEYWORD_EMBEDDING_UNAVAILABLE")
        similarity = max(scores)
        if similarity < SIMILARITY_GATE:
            await _finish_book(job_id, "REJECTED", "LOW_TOPIC_SIMILARITY")
            return
    result = await corpus_tagger.classify_book(
        book["title"], book["contents"], format_authors(book.get("authors")),
    )
    if result is None:
        code = corpus_tagger.last_error_code or "CLASSIFIER_UNAVAILABLE"
        raise IngestionFailure(code, retryable=code not in {"AUTH_ERROR", "NO_API_KEY"})
    status, reason, keyword, tags = validate_classification(book, result)
    await _finish_book(job_id, status, reason, embedding=embedding, classification=(keyword, tags), classification_result=result, similarity=similarity)


async def _claim_job() -> tuple[str, str] | None:
    async with database.async_session() as db:
        async with db.begin():
            priority = case((CorpusIngestionJob.source == "USER_LIBRARY", 0), (CorpusIngestionJob.job_type == "BOOK", 1), else_=2)
            job = (await db.execute(select(CorpusIngestionJob).where(
                CorpusIngestionJob.status.in_(["PENDING", "RETRY"]),
                CorpusIngestionJob.next_attempt_at <= _now(),
            ).order_by(priority, CorpusIngestionJob.next_attempt_at, CorpusIngestionJob.created_at)
             .with_for_update(skip_locked=True).limit(1))).scalar_one_or_none()
            if job is None:
                return None
            job.status = "RUNNING"
            job.attempts += 1
            job.updated_at = _now()
            return job.id, job.job_type


async def _record_failure(job_id: str, failure: IngestionFailure) -> None:
    async with database.async_session() as db:
        job = await db.get(CorpusIngestionJob, job_id)
        if not job or job.status != "RUNNING":
            return
        rate_limited = failure.code in {"RATE_LIMIT", "KAKAO_RATE_LIMIT"}
        if not failure.retryable or (job.attempts >= MAX_ATTEMPTS and not rate_limited):
            job.status = "FAILED"
        else:
            job.status = "RETRY"
            delay = min(21_600, 300 * 2 ** min(job.attempts - 1, 7)) if rate_limited else min(3600, 60 * 2 ** (job.attempts - 1))
            job.next_attempt_at = _now() + timedelta(seconds=delay)
        job.error_code = failure.code
        job.updated_at = _now()
        await db.commit()


async def recover_stale_jobs() -> None:
    async with database.async_session() as db:
        await db.execute(update(CorpusIngestionJob).where(
            CorpusIngestionJob.status == "RUNNING",
            CorpusIngestionJob.updated_at <= _now() - STALE_AFTER,
        ).values(status="RETRY", next_attempt_at=_now(), error_code="INTERRUPTED", updated_at=_now()))
        await db.commit()


async def run_worker(stop: asyncio.Event) -> None:
    await recover_stale_jobs()
    last_recovery = time.monotonic()
    while not stop.is_set():
        claimed = None
        try:
            if time.monotonic() - last_recovery >= 60:
                await recover_stale_jobs()
                last_recovery = time.monotonic()
            async with database.async_session() as control:
                acquired = (await control.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": _WORKER_LOCK})).scalar_one()
                if acquired:
                    try:
                        # Pause new ingestion work while Gemini's shared cooldown is active.
                        claimed = await _claim_job() if llm_cooldown.available() else None
                        if claimed:
                            job_id, job_type = claimed
                            if job_type == "BATCH":
                                await _process_batch(job_id)
                            else:
                                await _process_book(job_id)
                    finally:
                        await control.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _WORKER_LOCK})
        except asyncio.CancelledError:
            raise
        except IngestionFailure as exc:
            if claimed:
                await _record_failure(claimed[0], exc)
        except Exception as exc:
            logger.exception("Corpus ingestion failed job_id=%s error=%s", claimed[0] if claimed else "-", type(exc).__name__)
            if claimed:
                await _record_failure(claimed[0], IngestionFailure("WORKER_ERROR"))
        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_SECONDS if claimed else 5)
        except asyncio.TimeoutError:
            pass
