import asyncio
import time
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.main import app
from app.routers import data_builder
from app.services import book_ai_service
from app.services import query_rewriter
from app.services.search_retrieval import RetrievalCounts
from app.services.reference_search import ReferenceAnchor


@pytest.mark.asyncio
async def test_search_requires_internal_token_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-only-token")
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


@pytest.mark.asyncio
async def test_embed_endpoint_waits_for_result_and_reports_failure(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-only-token")
    request = {"title": "책", "isbn": "9780000000000", "authors": ["작가"]}
    calls = []

    async def saved(book):
        calls.append(book.isbn)
        await asyncio.sleep(0)
        return "saved"

    monkeypatch.setattr(book_ai_service, "embed_single_book", saved)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/books/embed-single", json=request, headers={"X-Internal-Token": "test-only-token"},
        )
        assert response.status_code == 200
        assert response.json() == {"message": "Single book embedding completed.", "status": "saved"}
        assert calls == [request["isbn"]]

        async def failed(book):
            raise HTTPException(status_code=503, detail="Book embedding is unavailable")

        monkeypatch.setattr(book_ai_service, "embed_single_book", failed)
        response = await client.post(
            "/api/books/embed-single", json=request, headers={"X-Internal-Token": "test-only-token"},
        )
        assert response.status_code == 503


@pytest.mark.asyncio
async def test_data_build_rejects_second_job_while_busy(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-only-token")
    await data_builder._data_build_lock.acquire()
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post(
                "/api/books/fetch-and-filter",
                json={"keywords": ["소설"]}, headers={"X-Internal-Token": "test-only-token"},
            )
        assert response.status_code == 409
        assert response.headers["Retry-After"] == "30"
    finally:
        data_builder._data_build_lock.release()


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

    async def fake_rerank(query, candidates, requested_form):
        nonlocal calls
        calls += 1
        assert requested_form == "ANY"
        return candidates

    monkeypatch.setattr(query_rewriter, "rewrite_query", forbidden_rewrite)
    monkeypatch.setattr(book_ai_service, "get_embedding", fake_embedding)
    monkeypatch.setattr(book_ai_service, "retrieve_candidates", fake_retrieve)
    monkeypatch.setattr(book_ai_service, "rerank_with_gemini", fake_rerank)

    results = await book_ai_service.search_by_natural_language("자기계발 책", object(), "test-job")
    assert len(results) == 1
    assert calls == 1


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

    async def rerank(query, candidates, requested_form):
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
async def test_single_book_formats_author_before_dedup_and_fails_without_embedding(monkeypatch):
    async def no_isbn(db, isbn):
        return False

    async def no_similar(db, title, authors):
        assert authors == "조지 오웰"
        return None

    async def no_embedding(text):
        return None

    monkeypatch.setattr(book_ai_service, "check_if_isbn_exists", no_isbn)
    monkeypatch.setattr(book_ai_service, "find_similar_corpus_edition", no_similar)
    monkeypatch.setattr(book_ai_service, "get_embedding", no_embedding)
    from app.schemas import SingleBookRequest
    book = SingleBookRequest(title="1984", isbn="9780000000000", authors=["조지 오웰"])
    with pytest.raises(HTTPException) as exc:
        await book_ai_service._embed_single_book_with_db(book, object())
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_duplicate_edition_gets_its_own_isbn_row_without_new_llm_call(monkeypatch):
    async def no_isbn(db, isbn):
        return False

    async def similar(db, title, authors):
        assert authors == "조지 오웰"
        return SimpleNamespace(keyword="디스토피아", similarity_score=0.8, embedding=[0.1, 0.2], tags=["디스토피아"])

    async def forbidden_embedding(text):
        raise AssertionError("an existing edition should reuse its embedding")

    class FakeDB:
        def __init__(self):
            self.saved = None
            self.commits = 0

        def add(self, book):
            self.saved = book

        async def commit(self):
            self.commits += 1

    monkeypatch.setattr(book_ai_service, "check_if_isbn_exists", no_isbn)
    monkeypatch.setattr(book_ai_service, "find_similar_corpus_edition", similar)
    monkeypatch.setattr(book_ai_service, "get_embedding", forbidden_embedding)
    from app.schemas import SingleBookRequest
    db = FakeDB()
    book = SingleBookRequest(title="1984 (새 판본)", isbn="9780000000001", authors=["조지 오웰"])
    assert await book_ai_service._embed_single_book_with_db(book, db) == "reused_edition"
    assert db.saved.isbn == book.isbn
    assert db.saved.embedding == [0.1, 0.2]
    assert db.commits == 1
