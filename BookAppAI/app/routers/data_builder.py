import asyncio
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.book_corpus import BookCorpus
from app.services import book_ai_service
from app.security import require_internal_token
from app.schemas import KeywordRequest, SingleBookRequest, AiSearchRequest, ReadingTagsRequest

router = APIRouter()
_data_build_lock = asyncio.Lock()


async def _run_data_build(keywords: list[str]) -> None:
    try:
        await book_ai_service.process_keywords(keywords)
    finally:
        _data_build_lock.release()

# --- Endpoints ---

@router.post("/api/books/fetch-and-filter", dependencies=[Depends(require_internal_token)])
async def fetch_and_filter_books(request: KeywordRequest, background_tasks: BackgroundTasks):
    """
    Triggers the AI book data building process in the background.
    """
    if not request.keywords:
        raise HTTPException(status_code=400, detail="Keywords list cannot be empty.")
    if _data_build_lock.locked():
        raise HTTPException(status_code=409, detail="Data build is already running", headers={"Retry-After": "30"})
    await _data_build_lock.acquire()
    background_tasks.add_task(_run_data_build, request.keywords)

    return {"message": "AI book data building process started in the background."}


@router.post("/api/books/embed-single", dependencies=[Depends(require_internal_token)])
async def embed_single_book(request: SingleBookRequest):
    """
    A successful response means the book was saved or deliberately deduplicated.
    """
    status = await book_ai_service.embed_single_book(request)
    return {"message": "Single book embedding completed.", "status": status}


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
