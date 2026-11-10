import asyncio
import httpx
import os
import time
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from contextlib import asynccontextmanager
from pathlib import Path
from alembic import command
from alembic.config import Config

from app.routers import data_builder, recommendation
from app.services import book_ai_service
from app.services.tagging_jobs import recover_interrupted_jobs, run_worker
from app.security import require_internal_token
import app.database as _db
from app.config import validate_prod_config
from .recommendation_service import get_recommendations

def upgrade_database() -> None:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_prod_config()  # 먼저 검증 — DATABASE_URL 포함
    await asyncio.to_thread(upgrade_database)
    _db.init_db()           # 검증 통과 후 엔진 생성
    await book_ai_service.init_embedding_model()
    await recover_interrupted_jobs()
    worker_stop = asyncio.Event()
    worker = asyncio.create_task(run_worker(worker_stop))
    try:
        yield
    finally:
        worker_stop.set()
        await worker
        book_ai_service.shutdown_embedding_model()
        await _db.engine.dispose()

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
app.include_router(recommendation.router)

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

@app.get("/recommendations/{user_id}", response_model=List[int], dependencies=[Depends(require_internal_token)])
async def recommend_books(user_id: int):
    """
    특정 사용자에게 도서를 추천합니다.
    """
    recommendations = await get_recommendations(user_id)
    return recommendations

@app.get("/health")
def health():
    return {"ok": True}
