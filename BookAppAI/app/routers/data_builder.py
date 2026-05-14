from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.book_corpus import BookCorpus
from app.services import book_ai_service
from app.schemas import KeywordRequest, SingleBookRequest, AiSearchRequest, ReadingTagsRequest

router = APIRouter()

# --- Endpoints ---

@router.post("/api/books/fetch-and-filter")
async def fetch_and_filter_books(request: KeywordRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """
    Triggers the AI book data building process in the background.
    """
    if not request.keywords:
        raise HTTPException(status_code=400, detail="Keywords list cannot be empty.")

    background_tasks.add_task(book_ai_service.process_keywords, request.keywords, db)

    return {"message": "AI book data building process started in the background."}


@router.post("/api/books/embed-single")
async def embed_single_book(request: SingleBookRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """
    Embeds a single book and adds it to the AI corpus in the background.
    """
    background_tasks.add_task(book_ai_service.embed_single_book, request, db)
    return {"message": "Single book embedding process started in the background."}


@router.post("/api/ai/search")
async def ai_search(request: AiSearchRequest, db: AsyncSession = Depends(get_db)):
    """
    Performs a natural language search for books using vector similarity.
    """
    if not request.query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty.")

    results = await book_ai_service.search_by_natural_language(request.query, db)
    return results


@router.post("/api/user/reading-tags")
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
