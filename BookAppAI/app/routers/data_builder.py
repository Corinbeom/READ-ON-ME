from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services import book_ai_service
from app.schemas import KeywordRequest, SingleBookRequest

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
