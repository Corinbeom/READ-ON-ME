import asyncio
import httpx
import os
import time
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi.responses import JSONResponse
from app.corpus_policy import CorpusPermissionError, hold_pending_jobs

from app.routers import data_builder, recommendation
from app.services.shelf_keywords import run_worker as run_shelf_keyword_worker
from app.security import require_internal_token
import app.database as _db
from app.config import validate_prod_config

def upgrade_database() -> None:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_prod_config()  # 먼저 검증 — DATABASE_URL 포함
    temporary = getattr(app.state, "standby", False)
    if not temporary:
        await asyncio.to_thread(upgrade_database)
    _db.init_db()           # 검증 통과 후 엔진 생성
    try:
        if temporary:
            config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
            expected = set(ScriptDirectory.from_config(config).get_heads())
            async with _db.engine.connect() as connection:
                installed = await connection.run_sync(
                    lambda conn: set(MigrationContext.configure(conn).get_current_heads())
                )
            if installed != expected:
                raise RuntimeError("AI standby requires the currently installed database schema")
            yield
            return
        async with _db.async_session() as db, db.begin():
            await hold_pending_jobs(db)
        worker = asyncio.create_task(run_shelf_keyword_worker())
        try:
            yield
        finally:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
    finally:
        await _db.engine.dispose()

app = FastAPI(lifespan=lifespan)

def standby():
    """Uvicorn factory for the temporary process used during an AI-only deployment."""
    app.state.standby = True
    return app


@app.exception_handler(CorpusPermissionError)
async def corpus_unavailable(request, exc):
    code = "AI_SEARCH_MAINTENANCE" if request.url.path == "/api/ai/search" else str(exc)
    logging.getLogger("app.metrics").info("corpus_request_blocked path=%s reason=%s", request.url.path, code)
    return JSONResponse(status_code=503, content={"code": code})


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
    return []

@app.get("/health")
def health():
    return {"ok": True}
