import logging
from time import perf_counter
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Header, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.corpus_policy import require_verified_corpus
from app import database
from app.database import get_db
from app.services.daily_choices import daily_choices, korean_today
from app.services.home_picks import home_picks
from app.services.reading_keyword_picks import public_picks
from app.services.shelf_keywords import shelf_keywords
from app.services.search_timing import measure_search_db
from app.services import corpus_ingestion
from app.services.release_status import confirm_release_status
from app.services.reviewed_corpus import search_reviewed, read_inputs
from app.services.reviewed_release import configured_release, require_index, require_release
from app.security import require_internal_token
from app.schemas import KeywordRequest, SingleBookRequest, AiSearchRequest, HomePicksRequest, ReadingTagsRequest, ReadingKeywordPicksRequest

router = APIRouter()
# --- Endpoints ---

@router.post("/api/books/fetch-and-filter", status_code=202, dependencies=[Depends(require_internal_token), Depends(require_verified_corpus)])
async def fetch_and_filter_books(request: KeywordRequest, db: AsyncSession = Depends(get_db)):
    try:
        job = await corpus_ingestion.create_batch_job(
            db, request.keywords,
            max_pages_per_term=request.max_pages_per_term,
            max_new_books=request.max_new_books,
        )
    except corpus_ingestion.BatchAlreadyRunning as exc:
        raise HTTPException(status_code=409, detail={"active_run_id": exc.run_id}, headers={"Retry-After": "30"}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"run_id": job.id, "status": job.status}


@router.get("/api/books/ingestion-runs/{run_id}", dependencies=[Depends(require_internal_token)])
async def ingestion_run_status(run_id: str, db: AsyncSession = Depends(get_db)):
    job = await corpus_ingestion.get_job(db, run_id)
    if not job or job["type"] != "BATCH":
        raise HTTPException(status_code=404, detail="Ingestion run not found")
    return job


@router.get("/api/books/ingestion-jobs/{job_id}", dependencies=[Depends(require_internal_token)])
async def ingestion_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await corpus_ingestion.get_job(db, job_id)
    if not job or job["type"] != "BOOK":
        raise HTTPException(status_code=404, detail="Ingestion job not found")
    return job


@router.post("/api/books/embed-single", status_code=202, dependencies=[Depends(require_internal_token), Depends(require_verified_corpus)])
async def embed_single_book(request: SingleBookRequest, db: AsyncSession = Depends(get_db)):
    status, job = await corpus_ingestion.enqueue_book(db, request.model_dump(), source="USER_LIBRARY")
    if status == "INVALID_ISBN":
        raise HTTPException(status_code=422, detail="A valid ISBN-10 or ISBN-13 is required")
    return {"status": status, "job_id": job.id if job else None}


@router.get("/api/ai/reviewed-release", dependencies=[Depends(require_internal_token)])
async def release_status(release: str = Depends(configured_release), db: AsyncSession = Depends(get_db)):
    await confirm_release_status(db, release)
    return {"release": release}


@router.get("/api/ai/reviewed-books/{isbn}", dependencies=[Depends(require_internal_token)])
async def reviewed_detail(isbn: str, x_reviewed_release: str = Header(), release: str = Depends(configured_release),
                          db: AsyncSession = Depends(get_db)):
    if release != x_reviewed_release:
        raise HTTPException(status_code=503, detail="AI_SEARCH_MAINTENANCE")
    await require_release(db, release)
    from sqlalchemy import text
    from app.corpus_policy import EMBEDDING_USES
    from app.services.embedding_backend import GEMINI_EMBEDDING_MODEL

    fields, version = await read_inputs(db, isbn, EMBEDDING_USES)
    indexed = await db.scalar(text("""
        SELECT 1 FROM corpus_derived_artifacts WHERE isbn=:isbn AND input_version=:version
        AND kind='embedding' AND model_version=:model
    """), {"isbn": isbn, "version": version, "model": GEMINI_EMBEDDING_MODEL})
    if not indexed:
        raise HTTPException(status_code=404, detail="No reviewed detail")
    return {"isbn13": isbn, **fields}


@router.post("/api/ai/search", dependencies=[Depends(require_internal_token)])
async def ai_search(
    request: AiSearchRequest, response: Response, release: str = Depends(configured_release), db: AsyncSession = Depends(get_db),
    x_reviewed_release: str | None = Header(default=None),
    x_request_id: Annotated[str | None, Header()] = None,
):
    """
    Performs a natural language search for books using vector similarity.
    """
    if x_reviewed_release != release:
        raise HTTPException(status_code=503, detail="AI_SEARCH_MAINTENANCE")
    if not request.query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty.")

    outcome: dict = {}
    started = perf_counter()
    timings = {"candidate_ms": 0.0, "input_db_ms": 0.0, "evidence_db_ms": 0.0, "evidence_insert_ms": 0.0}
    transaction_exit = None
    index_ready = None
    status = "ERROR"
    results = []
    try:
        async with db.begin():
            try:
                from sqlalchemy import text
                await db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
                index = await require_index(db, release, with_vectors=True)
                index_ready = perf_counter()
                with measure_search_db(db, timings):
                    results = await search_reviewed(db, request.query, outcome, index=index, timings=timings)
            finally:
                transaction_exit = perf_counter()
        status = outcome.get("status", "NO_MATCH")
    finally:
        ended = perf_counter()
        index_ms = ((index_ready or transaction_exit or ended) - started) * 1000
        total_ms = (ended - started) * 1000
        embed_ms = timings.get("embed_ms", 0.0)
        rerank_ms = timings.get("rerank_ms", 0.0)
        other_ms = total_ms - index_ms - embed_ms - rerank_ms
        tx_exit_ms = (ended - transaction_exit) * 1000 if transaction_exit is not None else 0.0
        provider = results[0].get("ranking_status") if results else None
        # Uvicorn configures this logger at INFO in the production image.
        trace_id = x_request_id if x_request_id and len(x_request_id) == 36 and all(
            c in "0123456789abcdefABCDEF-" for c in x_request_id
        ) else "-"
        logging.getLogger("uvicorn.error").info(
            "reviewed_search request_id=%s outcome=%s books=%d index_ms=%.1f embed_ms=%.1f rerank_ms=%.1f "
            "other_ms=%.1f total_ms=%.1f candidate_ms=%.1f input_db_ms=%.1f evidence_db_ms=%.1f "
            "evidence_insert_ms=%.1f tx_exit_ms=%.1f ranker=%s", trace_id, status, len(results), index_ms, embed_ms,
            rerank_ms, other_ms, total_ms, timings["candidate_ms"], timings["input_db_ms"],
            timings["evidence_db_ms"], timings["evidence_insert_ms"], tx_exit_ms,
            provider if provider in ("GEMINI", "GROQ", "FALLBACK") else "NONE",
        )
    response.headers["X-Search-Outcome"] = outcome.get("status", "NO_MATCH")
    response.headers["X-Search-Reason"] = outcome.get("reason_code", "NONE")
    response.headers["X-Search-Basis"] = outcome.get("basis", "NONE")
    return results


async def keyword_books(x_reviewed_release: str | None = Header(default=None)):
    if not x_reviewed_release:
        return {}
    if x_reviewed_release != configured_release():
        raise HTTPException(status_code=503, detail="AI_SEARCH_MAINTENANCE")
    async with database.async_session() as db, db.begin():
        from sqlalchemy import text
        await db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        return await require_release(db, x_reviewed_release)


@router.post("/api/user/reading-tags", dependencies=[Depends(require_internal_token)])
async def get_reading_tags(request: ReadingTagsRequest, db: AsyncSession = Depends(get_db)):
    async with db.begin():
        return await shelf_keywords(db, request.isbns, request.limit)


@router.post("/api/books/reading-keyword-picks", dependencies=[Depends(require_internal_token)])
async def get_reading_keyword_picks(request: ReadingKeywordPicksRequest, books=Depends(keyword_books)):
    return public_picks(books, request.keywords)


@router.get("/api/books/daily-choices", dependencies=[Depends(require_internal_token)])
async def get_daily_choices(books=Depends(keyword_books)):
    return daily_choices(books, korean_today())


@router.post("/api/user/home-picks", dependencies=[Depends(require_internal_token)])
async def get_home_picks(request: HomePicksRequest, x_reviewed_release: str = Header(),
                         release: str = Depends(configured_release), db: AsyncSession = Depends(get_db)):
    if release != x_reviewed_release:
        raise HTTPException(status_code=503, detail="AI_SEARCH_MAINTENANCE")
    from sqlalchemy import text
    async with db.begin():
        await db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        books = await require_release(db, release)
        shelf = await shelf_keywords(db, request.reading, 12, enqueue_missing=False)
        return home_picks(books, shelf["keywords"], set(request.owned) | set(request.reading), request.peers)
