import json
import os
from datetime import date

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app import database
from app.corpus_policy import MODEL_USES
from app.main import app
from app.services.gemini_tagger import GeminiTagger
from app.services.reviewed_corpus import record_field
from app.services.shelf_keywords import process_next, shelf_keywords


def test_gemini_preserves_original_evidence_and_canonicalizes_labels():
    result = {"primary_keyword": "SF", "tags": ["SF소설", "과학소설", "unknown"], "evidence_quote": "science fiction"}
    parsed = GeminiTagger()._parse_response({"candidates": [{"content": {"parts": [{"text": json.dumps(result)}]}}]})
    assert parsed["primary_keyword"] == "과학소설"
    assert parsed["tags"] == ["과학소설"]
    assert parsed["evidence_quote"] == "science fiction"
    result["tags"] = ["unmapped"]
    assert GeminiTagger()._parse_response({"candidates": [{"content": {"parts": [{"text": json.dumps(result)}]}}]}) is None


@pytest.mark.asyncio
async def test_shelf_route_needs_no_release_and_honors_source_revocation(monkeypatch):
    url = os.getenv("REVIEWED_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a migrated disposable PostgreSQL database")
    engine = create_async_engine(url)
    # Public catalog fixture, independent of any account or Galpi seed.
    isbn = "9788960323704"
    monkeypatch.setenv("INTERNAL_API_TOKEN", "fixture")
    monkeypatch.delenv("GALPI_REVIEWED_RELEASE", raising=False)
    async def session():
        async with AsyncSession(engine) as db:
            yield db
    app.dependency_overrides[database.get_db] = session
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            body = {"isbns": [isbn, isbn, "invalid", "9790000000000"]}
            response = await client.post("/api/user/reading-tags", json=body, headers={"X-Internal-Token": "fixture"})
            assert response.status_code == 200
            result = response.json()
            assert result["analyzed"] == 1 and result["pending"] == result["failed"] == 0
            assert all(k["catalog_count"] == 1 and k["book_isbns"] == [isbn] for k in result["keywords"])
        async with AsyncSession(engine) as db:
            await db.execute(text("UPDATE corpus_use_policy SET active=false WHERE provider='SEONGNAM_HOLDINGS'"))
            assert (await shelf_keywords(db, [isbn], 10))["analyzed"] == 0
            assert await db.scalar(text("SELECT count(*) FROM shelf_keyword_jobs WHERE isbn=:isbn"), {"isbn": isbn}) == 0
    finally:
        app.dependency_overrides.pop(database.get_db)
        await engine.dispose()


@pytest.mark.asyncio
async def test_model_jobs_are_deduplicated_and_checked_again_before_dispatch(monkeypatch):
    url = os.getenv("REVIEWED_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a migrated disposable PostgreSQL database")
    engine = create_async_engine(url)
    isbn = "9780306406157"
    calls = []
    async def classify(self, **fields):
        calls.append(fields)
        return {"tags": ["우주"], "evidence_quote": "별과 우주의 기원에 관한 이야기"}
    monkeypatch.setattr(GeminiTagger, "_classify", classify)
    try:
        async with AsyncSession(engine) as db:
            await db.execute(text("""
                INSERT INTO corpus_use_policy VALUES ('SHELF_TEST','v1','fixture',current_date,:uses,true)
            """), {"uses": sorted(MODEL_USES)})
            for field, value in (("title", "별"), ("authors", "저자"), ("contents", "별과 우주의 기원에 관한 이야기")):
                await record_field(db, isbn, field, value, "SHELF_TEST", "v1", "fixture", date.today())
            assert not (await shelf_keywords(db, [isbn], 12, enqueue_missing=False))["keywords"]
            assert await db.scalar(text("SELECT count(*) FROM shelf_keyword_jobs WHERE isbn=:isbn"), {"isbn": isbn}) == 0
            for _ in range(2):
                result = await shelf_keywords(db, [isbn], 12)
                assert result["pending"] == 1
            assert await db.scalar(text("SELECT count(*) FROM shelf_keyword_jobs WHERE isbn=:isbn"), {"isbn": isbn}) == 1
            await db.execute(text("UPDATE corpus_use_policy SET active=false WHERE provider='SHELF_TEST'"))
            assert await process_next(db)
            assert calls == []
            await db.execute(text("UPDATE corpus_use_policy SET active=true WHERE provider='SHELF_TEST'"))
            assert (await shelf_keywords(db, [isbn], 12))["pending"] == 1
            assert await process_next(db)
            assert len(calls) == 1
            result = await shelf_keywords(db, [isbn], 12)
            assert result["keywords"] == [{"tag": "우주", "count": 1, "book_isbns": [isbn], "catalog_count": 0}]
            await record_field(db, isbn, "contents", "새로운 자료", "SHELF_TEST", "v1", "fixture", date.today())
            assert (await shelf_keywords(db, [isbn], 12))["pending"] == 1
            assert not (await shelf_keywords(db, [isbn], 12))["keywords"]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_stale_job_and_provider_failure_report_distinct_states(monkeypatch):
    url = os.getenv("REVIEWED_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a migrated disposable PostgreSQL database")
    engine = create_async_engine(url)
    isbn = "9799999999990"
    calls = []
    async def rate_limited(self, **fields):
        calls.append(fields["contents"])
        self.last_error_code = "RATE_LIMIT"
        return None
    monkeypatch.setattr(GeminiTagger, "_classify", rate_limited)
    try:
        async with AsyncSession(engine) as db:
            await db.execute(text("""
                INSERT INTO corpus_use_policy VALUES ('SHELF_TEST','v1','fixture',current_date,:uses,true)
            """), {"uses": sorted(MODEL_USES)})
            for field, value in (("title", "서명"), ("authors", "저자"), ("contents", "처음 자료")):
                await record_field(db, isbn, field, value, "SHELF_TEST", "v1", "fixture", date.today())
            await shelf_keywords(db, [isbn], 12)
            await record_field(db, isbn, "contents", "변경된 자료", "SHELF_TEST", "v1", "fixture", date.today())
            assert await process_next(db)
            assert calls == []
            assert (await shelf_keywords(db, [isbn], 12))["pending"] == 1
            await db.execute(text("UPDATE shelf_keyword_jobs SET attempts=4 WHERE isbn=:isbn AND status='pending'"),
                             {"isbn": isbn})
            assert await process_next(db)
            assert calls == ["변경된 자료"]
            result = await shelf_keywords(db, [isbn], 12)
            assert result["failed"] == 1 and result["pending"] == 0
            assert not await process_next(db)
    finally:
        await engine.dispose()
