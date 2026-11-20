import logging
from fastapi import APIRouter, Depends, HTTPException, Header, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.corpus_policy import require_verified_corpus
from app.database import get_db
from app.services import corpus_ingestion
from app.services.reviewed_corpus import search_reviewed, read_inputs
from app.services.reviewed_release import configured_release, require_release
from app.security import require_internal_token
from app.schemas import KeywordRequest, SingleBookRequest, AiSearchRequest, ReadingTagsRequest, ReadingKeywordPicksRequest

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
    await require_release(db, release)
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
):
    """
    Performs a natural language search for books using vector similarity.
    """
    if x_reviewed_release != release:
        raise HTTPException(status_code=503, detail="AI_SEARCH_MAINTENANCE")
    if not request.query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty.")

    outcome: dict = {}
    async with db.begin():
        from sqlalchemy import text
        await db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        await require_release(db, release)
        results = await search_reviewed(db, request.query, outcome)
    logging.getLogger("app.metrics").info("reviewed_search outcome=%s books=%d", outcome.get("status"), len(results))
    response.headers["X-Search-Outcome"] = outcome.get("status", "NO_MATCH")
    response.headers["X-Search-Reason"] = outcome.get("reason_code", "NONE")
    response.headers["X-Search-Basis"] = outcome.get("basis", "NONE")
    return results


@router.post("/api/user/reading-tags", dependencies=[Depends(require_internal_token)])
async def get_reading_tags(request: ReadingTagsRequest):
    return {"keywords": [], "analyzed": 0}


@router.post("/api/books/reading-keyword-picks", dependencies=[Depends(require_internal_token)])
async def get_reading_keyword_picks(request: ReadingKeywordPicksRequest):
    return []
