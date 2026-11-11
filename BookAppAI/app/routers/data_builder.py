from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.book_corpus import BookCorpus
from app.services import book_ai_service, corpus_ingestion
from app.security import require_internal_token
from app.schemas import KeywordRequest, SingleBookRequest, AiSearchRequest, ReadingTagsRequest

router = APIRouter()
# --- Endpoints ---

@router.post("/api/books/fetch-and-filter", status_code=202, dependencies=[Depends(require_internal_token)])
async def fetch_and_filter_books(request: KeywordRequest, db: AsyncSession = Depends(get_db)):
    try:
        job = await corpus_ingestion.create_batch_job(db, request.keywords)
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


@router.post("/api/books/embed-single", status_code=202, dependencies=[Depends(require_internal_token)])
async def embed_single_book(request: SingleBookRequest, db: AsyncSession = Depends(get_db)):
    status, job = await corpus_ingestion.enqueue_book(db, request.model_dump(), source="USER_LIBRARY")
    if status == "INVALID_ISBN":
        raise HTTPException(status_code=422, detail="A valid ISBN-10 or ISBN-13 is required")
    return {"status": status, "job_id": job.id if job else None}


@router.post("/api/ai/search", dependencies=[Depends(require_internal_token)])
async def ai_search(request: AiSearchRequest, db: AsyncSession = Depends(get_db), x_request_id: str | None = Header(default=None)):
    """
    Performs a natural language search for books using vector similarity.
    """
    if not request.query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty.")

    results = await book_ai_service.search_by_natural_language(request.query, db, x_request_id)
    return results


@router.post("/api/user/reading-tags", dependencies=[Depends(require_internal_token)])
async def get_reading_tags(request: ReadingTagsRequest, db: AsyncSession = Depends(get_db)):
    """
    Aggregates tags from user's book corpus entries and returns top N keywords.
    """
    if not request.isbns:
        return {"keywords": [], "analyzed": 0}

    result = await db.execute(
        select(BookCorpus.tags).where(BookCorpus.isbn.in_(request.isbns))
    )
    rows = result.scalars().all()
    analyzed = len(rows)

    all_tags: list[str] = []
    for tags in rows:
        if isinstance(tags, list):
            all_tags.extend(t for t in tags if isinstance(t, str) and t)

    if not all_tags:
        return {"keywords": [], "analyzed": analyzed}

    counter = Counter(all_tags)
    top_tags = counter.most_common(request.limit)
    keywords = [{"tag": tag, "count": count} for tag, count in top_tags]

    return {"keywords": keywords, "analyzed": analyzed}
