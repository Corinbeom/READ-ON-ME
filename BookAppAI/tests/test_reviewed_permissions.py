from datetime import date
import os

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.corpus_policy import CorpusPermissionError, EMBEDDING_USES, MODEL_USES, permits
from app.services import llm_cooldown, reranker
from app.services.reviewed_corpus import derived, index_reviewed, rank_reviewed, record_field


@pytest.mark.parametrize("provider", ["KAKAO", " kakao ", "UNKNOWN", "UNVERIFIED", "", None])
def test_untrusted_identity_cannot_grant_model_rights(provider):
    assert not permits(provider, True, EMBEDDING_USES, MODEL_USES)


@pytest.mark.asyncio
async def test_field_permissions_versions_and_failover(monkeypatch):
    url = os.getenv("REVIEWED_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a migrated disposable PostgreSQL database")
    engine = create_async_engine(url)
    isbn = "9780306406157"
    requests = []
    client = httpx.AsyncClient

    def respond(request):
        requests.append(request.content.decode())
        if request.url.host == "api.groq.com":
            return httpx.Response(200, json={"choices": [{"message": {"content": '{"selections":[]}'}}]})
        return httpx.Response(503)

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: client(transport=httpx.MockTransport(respond)))
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", "fixture")
    monkeypatch.setenv("GROQ_API_KEY", "fixture")
    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0)
    monkeypatch.setattr(reranker, "groq_cooldown", llm_cooldown.ProviderCooldown())
    try:
        async with AsyncSession(engine) as db:
            for provider, uses in (("KAKAO", []), ("TEST_EDITOR", sorted(EMBEDDING_USES))):
                await db.execute(text("""
                    INSERT INTO corpus_use_policy VALUES (:p,'test','fixture',current_date,:uses,true)
                """), {"p": provider, "uses": uses})

            async def record(field, value, provider="TEST_EDITOR"):
                return await record_field(db, isbn, field, value, provider, "test", "fixture", date.today())

            await record("contents", "처음 읽는 독자를 위한 이야기입니다.")
            await record("authors", "테스트 작가")
            await record("title", "FORBIDDEN_CANARY", "KAKAO")
            assert (await db.execute(text("SELECT value FROM corpus_field_versions WHERE provider='KAKAO' AND policy_version='test'"))).scalar_one() is None
            with pytest.raises(CorpusPermissionError):
                await index_reviewed(db, isbn)
            with pytest.raises(CorpusPermissionError):
                await rank_reviewed(db, "추천", [isbn])
            assert requests == []

            version = await record("title", "검증한 제목")
            assert await record("title", "검증한 제목") == version
            calls = []

            async def compute(fields):
                calls.append(fields["title"])
                return {"title": fields["title"]}

            for model in ("model1", "model1", "model2"):
                await derived(db, isbn, MODEL_USES, "tags", model, compute)
            assert calls == ["검증한 제목", "검증한 제목"]
            assert await record("title", "새 제목") != version
            await derived(db, isbn, MODEL_USES, "tags", "model2", compute)
            assert calls[-1] == "새 제목"

            outcome = {}
            assert await rank_reviewed(db, "추천", [isbn], outcome) == []
            assert outcome["status"] == "NO_MATCH"
            assert len(requests) == 2
            assert all("B1" in body and isbn not in body and "FORBIDDEN_CANARY" not in body for body in requests)
            await db.execute(text("UPDATE corpus_use_policy SET active=false WHERE provider='TEST_EDITOR' AND version='test'"))
            with pytest.raises(CorpusPermissionError):
                await derived(db, isbn, MODEL_USES, "tags", "model2", compute)
            assert len(requests) == 2
            await db.rollback()
    finally:
        await engine.dispose()
