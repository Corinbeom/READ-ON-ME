from fastapi import APIRouter
from typing import List

from app.schemas import ContentRecommendRequest

router = APIRouter()


@router.post("/recommendations/content", response_model=List[str])
async def get_content_recommendations(request: ContentRecommendRequest):
    return []
