import httpx
from fastapi import FastAPI
from typing import List
from contextlib import asynccontextmanager

from app.routers import data_builder
from app.database import engine, Base
from .recommendation_service import get_recommendations

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)

app.include_router(data_builder.router)

SPRING_BOOT_SERVER_URL = "http://localhost:8080"

@app.get("/test-spring-connection")
async def test_spring_connection():
    """
    Spring Boot 서버의 테스트 엔드포인트(/api/books/test)와 통신합니다.
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{SPRING_BOOT_SERVER_URL}/api/books/test")
            response.raise_for_status()  # HTTP 오류가 발생하면 예외를 발생시킵니다.
            return response.json()
        except httpx.RequestError as exc:
            return {"error": f"Spring Boot 서버에 연결하는 중 오류 발생: {exc}"}

@app.get("/recommendations/{user_id}", response_model=List[int])
async def recommend_books(user_id: int):
    """
    특정 사용자에게 도서를 추천합니다.
    """
    recommendations = await get_recommendations(user_id)
    return recommendations
