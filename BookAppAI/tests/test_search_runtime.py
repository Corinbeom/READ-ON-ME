import asyncio
import time
from types import SimpleNamespace

import httpx
import pytest

from app.main import app
from app.database import get_db
from app.services import corpus_ingestion
from app.services import book_ai_service
from app.services import query_rewriter
from app.services import reranker
from app.services.search_retrieval import RetrievalCounts
from app.services.reference_search import ReferenceAnchor


@pytest.mark.asyncio
async def test_search_keeps_array_body_and_exposes_outcome_headers(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-only-token")

    async def fake_db():
        yield object()

    async def fake_search(query, db, request_id=None, outcome=None):
        assert request_id == "job-1"
        outcome.update(status="FALLBACK", reason_code="HTTP_503", basis="SHARED_THEMES")
        return [{"isbn": "1", "ranking_status": "FALLBACK"}]

    monkeypatch.setattr(book_ai_service, "search_by_natural_language", fake_search)
    app.dependency_overrides[get_db] = fake_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post(
                "/api/ai/search", json={"query": "비슷한 소설"},
                headers={"X-Internal-Token": "test-only-token", "X-Request-ID": "job-1"},
            )
        assert response.status_code == 200
        assert response.json() == [{"isbn": "1", "ranking_status": "FALLBACK"}]
        assert response.headers["X-Search-Outcome"] == "FALLBACK"
        assert response.headers["X-Search-Reason"] == "HTTP_503"
        assert response.headers["X-Search-Basis"] == "SHARED_THEMES"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_requires_internal_token_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-only-token")
    async def fake_db():
        yield object()
    app.dependency_overrides[get_db] = fake_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            denied = await client.post("/api/ai/search", json={"query": "책 추천"})
            assert denied.status_code == 403
            assert (await client.get("/recommendations/1")).status_code == 403
            allowed = await client.post(
                "/api/books/fetch-and-filter",
                headers={"X-Internal-Token": "test-only-token"},
                json={"keywords": []},
            )
            assert allowed.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_embed_endpoint_accepts_durable_job(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-only-token")
    request = {"title": "책", "isbn": "9780000000000", "authors": ["작가"]}
    calls = []

    async def fake_db():
        yield object()

    async def saved(db, book, *, source):
        calls.append((book["isbn"], source))
        await asyncio.sleep(0)
        return "QUEUED", SimpleNamespace(id="book-job")

    monkeypatch.setattr(corpus_ingestion, "enqueue_book", saved)
    app.dependency_overrides[get_db] = fake_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post(
                "/api/books/embed-single", json=request, headers={"X-Internal-Token": "test-only-token"},
            )
            assert response.status_code == 202
            assert response.json() == {"status": "QUEUED", "job_id": "book-job"}
            assert calls == [(request["isbn"], "USER_LIBRARY")]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_data_build_returns_durable_run_id(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-only-token")
    async def fake_db():
        yield object()

    async def create_job(db, keywords, *, max_pages_per_term, max_new_books):
        assert keywords == ["소설"]
        assert (max_pages_per_term, max_new_books) == (1, 5)
        return SimpleNamespace(id="batch-job", status="PENDING")

    monkeypatch.setattr(corpus_ingestion, "create_batch_job", create_job)
    app.dependency_overrides[get_db] = fake_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post(
                "/api/books/fetch-and-filter",
                json={"keywords": ["소설"], "max_pages_per_term": 1, "max_new_books": 5},
                headers={"X-Internal-Token": "test-only-token"},
            )
        assert response.status_code == 202
        assert response.json() == {"run_id": "batch-job", "status": "PENDING"}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_embedding_runs_serially_off_event_loop(monkeypatch):
    active = 0
    maximum = 0

    class FakeVector:
        def tolist(self):
            return [0.1]

    class FakeModel:
        def encode(self, value, convert_to_numpy):
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            time.sleep(0.04)
            active -= 1
            return FakeVector()

    monkeypatch.setattr(book_ai_service, "embedding_model", FakeModel())
    heartbeat = False

    async def pulse():
        nonlocal heartbeat
        await asyncio.sleep(0.01)
        heartbeat = True

    first, second, _ = await asyncio.gather(
        book_ai_service.get_embedding("첫째"),
        book_ai_service.get_embedding("둘째"),
        pulse(),
    )
    assert first == second == [0.1]
    assert maximum == 1
    assert heartbeat


@pytest.mark.asyncio
async def test_search_uses_one_rerank_and_no_query_rewrite(monkeypatch):
    calls = 0

    async def forbidden_rewrite(*args):
        raise AssertionError("online query rewrite should not run")

    async def fake_embedding(prompt):
        return [0.1]

    async def fake_retrieve(db, embedding, intent, keywords, exclude_author=None):
        return ([{
            "isbn": "1", "title": "좋은 습관", "authors": "작가",
            "contents": "좋은 습관을 만드는 이야기를 자세히 담은 책입니다. 삶을 바꾸는 방법도 소개합니다.",
            "keyword": "자기계발", "tags": ["자기계발"], "retrieval_score": 0.8,
        }], RetrievalCounts(vector=1, merged=1))

    async def fake_rerank(query, candidates, requested_form, request_id=None, genre=None, outcome=None, verified_fallback=None, diagnostics=None):
        nonlocal calls
        calls += 1
        assert requested_form == "ANY"
        assert request_id == "test-job"
        assert diagnostics is not None
        diagnostics["model_input_isbns"] = [book["isbn"] for book in candidates]
        return candidates

    monkeypatch.setattr(query_rewriter, "rewrite_query", forbidden_rewrite)
    monkeypatch.setattr(book_ai_service, "get_embedding", fake_embedding)
    monkeypatch.setattr(book_ai_service, "retrieve_candidates", fake_retrieve)
    monkeypatch.setattr(book_ai_service, "rerank_with_gemini", fake_rerank)

    diagnostics = {}
    results = await book_ai_service.search_by_natural_language(
        "자기계발 책", object(), "test-job", diagnostics=diagnostics,
    )
    assert len(results) == 1
    assert calls == 1
    assert diagnostics["retrieved_isbns"] == ["1"]
    assert diagnostics["filtered_isbns"] == ["1"]
    assert diagnostics["model_input_isbns"] == ["1"]
    assert diagnostics["result_isbns"] == ["1"]


@pytest.mark.asyncio
async def test_korean_novel_constraint_reaches_reranker_only_with_supported_candidates(monkeypatch):
    async def embedding(prompt):
        return [0.1]

    async def retrieve(db, vector, intent, keywords, exclude_author=None):
        assert intent.genre == "소설"
        assert "한국" in intent.constraints
        return ([
            {"isbn": "foreign", "title": "당신 인생의 이야기", "authors": "테드 창",
             "contents": "과학소설 작가의 SF 소설집을 한국어로 번역하여 출간했습니다.",
             "keyword": "SF", "tags": ["SF", "소설"], "retrieval_score": 0.9},
            {"isbn": "korean", "title": "여성작가 SF 단편모음집", "authors": "여러 작가",
             "contents": "동시대 한국 여성 작가들의 SF를 모아 여러 단편을 수록한 소설집입니다.",
             "keyword": "SF", "tags": ["SF", "한국"], "retrieval_score": 0.8},
        ], RetrievalCounts(vector=2, merged=2))

    async def rerank(query, candidates, requested_form, request_id=None, genre=None, outcome=None, verified_fallback=None):
        assert requested_form == "STORY"
        assert [book["isbn"] for book in candidates] == ["korean"]
        return candidates

    monkeypatch.setattr(book_ai_service, "get_embedding", embedding)
    monkeypatch.setattr(book_ai_service, "retrieve_candidates", retrieve)
    monkeypatch.setattr(book_ai_service, "rerank_with_gemini", rerank)
    results = await book_ai_service.search_by_natural_language("한국소설 추천", object())
    assert [book["isbn"] for book in results] == ["korean"]


@pytest.mark.asyncio
async def test_reference_author_search_uses_anchor_and_excludes_author(monkeypatch):
    async def anchor(db, author):
        assert author == "조지 오웰"
        return ReferenceAnchor("조지 오웰", ["1984", "동물 농장"], [0.1, 0.2])

    async def forbidden_embedding(prompt):
        raise AssertionError("reference search should reuse stored embeddings")

    async def retrieve(db, embedding, intent, keywords, exclude_author=None):
        assert embedding == [0.1, 0.2]
        assert exclude_author == "조지 오웰"
        return ([{
            "isbn": "1", "title": "다른 소설", "authors": "다른 작가",
            "contents": "분위기가 비슷한 다른 작가의 긴 소설 설명입니다. 충분한 내용이 있습니다.",
            "keyword": "소설", "tags": ["소설"], "retrieval_score": 0.8,
        }], RetrievalCounts(vector=1, merged=1))

    async def rerank(query, candidates, requested_form, request_id=None, genre=None, outcome=None, verified_fallback=None):
        assert "기준 작품: 1984, 동물 농장" in query
        assert requested_form == "STORY"
        return candidates

    monkeypatch.setattr(book_ai_service, "find_reference_anchor", anchor)
    monkeypatch.setattr(book_ai_service, "get_embedding", forbidden_embedding)
    monkeypatch.setattr(book_ai_service, "retrieve_candidates", retrieve)
    monkeypatch.setattr(book_ai_service, "rerank_with_gemini", rerank)
    results = await book_ai_service.search_by_natural_language(
        "조지 오웰 작가가 쓴 책과 유사한 분위기의 책을 추천해줘", object(),
    )
    assert [book["isbn"] for book in results] == ["1"]


@pytest.mark.asyncio
async def test_other_author_similar_search_uses_verified_fallback(monkeypatch):
    async def anchor(db, author):
        assert author == "김영하"
        return ReferenceAnchor(author, ["기준 소설"], [0.1, 0.2], ["기억", "상실", "가족"])

    async def retrieve(db, embedding, intent, keywords, exclude_author=None):
        assert exclude_author == "김영하"
        return ([
            {"isbn": "same", "title": "기억의 소설", "authors": "김영하",
             "contents": "오래된 기억과 상실을 겪는 한 가족의 삶을 그린 장편소설입니다.", "keyword": "소설", "tags": ["기억", "상실"], "retrieval_score": 0.9},
            {"isbn": "other", "title": "다른 기억", "authors": "다른 작가",
             "contents": "오래된 기억과 상실을 겪는 한 가족의 삶을 그린 장편소설입니다.", "keyword": "소설", "tags": ["기억", "상실"], "retrieval_score": 0.8},
            {"isbn": "weak", "title": "기억의 조각", "authors": "또 다른 작가",
             "contents": "기억을 따라 오래된 마을로 돌아간 인물의 여정을 그린 장편소설입니다.", "keyword": "소설", "tags": ["기억"], "retrieval_score": 0.7},
        ], RetrievalCounts(vector=3, merged=3))

    monkeypatch.setattr(book_ai_service, "find_reference_anchor", anchor)
    monkeypatch.setattr(book_ai_service, "retrieve_candidates", retrieve)
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", None)
    outcome = {}
    results = await book_ai_service.search_by_natural_language(
        "김영하 작가의 소설과 비슷한 책", object(), outcome=outcome,
    )
    assert [book["isbn"] for book in results] == ["other"]
    assert results[0]["ranking_status"] == "FALLBACK"
    assert outcome == {"status": "FALLBACK", "reason_code": "NO_API_KEY", "basis": "SHARED_THEMES"}
