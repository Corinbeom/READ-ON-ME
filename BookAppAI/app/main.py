import httpx
import os
import time
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

# 기본 요청 타이밍 로깅
logger = logging.getLogger("app.metrics")

@app.middleware("http")
async def request_timing_middleware(request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
        return response
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "request_completed method=%s path=%s status=%s latency_ms=%.2f",
            request.method,
            request.url.path,
            getattr(locals().get("response", None), "status_code", "unknown"),
            elapsed_ms,
        )

app.add_middleware(
      CORSMiddleware,
      allow_origins=[
          origin.strip()
          for origin in os.getenv("AI_CORS_ORIGINS", "http://localhost:8081").split(",")
          if origin.strip()
      ],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )

app.include_router(data_builder.router)

# Docker 환경에서는 컨테이너 간 통신을 위해 서비스명(backend)을 사용해야 합니다.
# - 로컬 실행: http://localhost:8080
# - docker-compose: http://backend:8080
SPRING_BOOT_SERVER_URL = os.getenv("SPRING_BOOT_URL", "http://localhost:8080")

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

@app.get("/health")
def health():
    return {"ok": True}