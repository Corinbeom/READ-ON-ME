from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.schemas import ContentRecommendRequest
from app.services.user_profile_service import content_based_recommend

router = APIRouter()


@router.post("/recommendations/content", response_model=List[str])
async def get_content_recommendations(
    request: ContentRecommendRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    유저 독서 목록(ISBN + 상태)을 받아 Content-based 추천 ISBN 목록을 반환한다.
    Spring Boot RecommendationService가 CF 결과와 RRF로 결합한다.
    """
    return await content_based_recommend(
        user_books=request.user_books,
        db=db,
        limit=request.limit,
    )
