from datetime import date

import httpx
import pytest

from app.services import curated_corpus


@pytest.mark.asyncio
async def test_library_discovery_preserves_subject_and_deduplicates_isbns(monkeypatch):
    monkeypatch.setenv("LIBRARY_BIGDATA_API_KEY", "test-key")
    requests = []

    def handler(request):
        requests.append(request)
        assert request.url.params["authKey"] == "test-key"
        assert request.url.params["kdc"] == "8"
        page = int(request.url.params["pageNo"])
        docs = [{"doc": {"isbn13": "9780000000002", "ranking": 7, "bookname": "별의 이야기"}}]
        if page == 3:
            docs.append({"doc": {"isbn13": "9780000000019", "ranking": 105}})
        return httpx.Response(200, json={"response": {"docs": docs}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        found = await curated_corpus.discover_naru_popular(
            kdc="8", start_date=date(2026, 1, 1), end_date=date(2026, 10, 31),
            pages=[1, 3], client=client,
        )
    assert len(requests) == 2
    assert [row["isbn"] for row in found] == ["9780000000002", "9780000000019"]
    assert found[0]["discovery_source"] == "DATA4LIBRARY_POPULAR"
    assert found[0]["source_context"]["title"] == "별의 이야기"
    assert found[1]["source_context"]["page"] == 3


@pytest.mark.asyncio
async def test_kakao_isbn_lookup_rejects_unrelated_result(monkeypatch):
    monkeypatch.setenv("KAKAO_API_KEY", "test-key")

    def handler(request):
        assert request.url.params["query"] == "9780000000002"
        assert request.url.params["target"] == "isbn"
        return httpx.Response(200, json={"documents": [
            {"isbn": "9780000000019", "title": "다른 책"},
            {"isbn": "0000000000 9780000000002", "title": "맞는 책", "authors": ["저자"],
             "contents": "책 소개"},
        ]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        book = await curated_corpus.fetch_kakao_exact("9780000000002", client)
    assert book["title"] == "맞는 책"
    assert book["isbn"] == "9780000000002"


@pytest.mark.asyncio
async def test_verified_candidate_holds_unmatched_isbn(monkeypatch):
    async def missing(isbn):
        return None

    monkeypatch.setattr(curated_corpus, "fetch_kakao_exact", missing)
    result = await curated_corpus.verify_candidate({
        "isbn": "9780000000002", "discovery_source": "PUBLISHER_CATALOG",
        "source_url": "https://example.org/books/1", "target_subject": "SF",
    })
    assert result["status"] == "HOLD"
    assert result["reason"] == "ISBN_METADATA_NOT_FOUND"


@pytest.mark.asyncio
async def test_verified_candidate_holds_source_title_mismatch(monkeypatch):
    async def kakao(isbn):
        return {"isbn": isbn, "title": "전혀 다른 책", "authors": ["작가"],
                "contents": "이 책은 우주를 배경으로 이야기를 펼치는 장편소설입니다."}

    monkeypatch.setattr(curated_corpus, "fetch_kakao_exact", kakao)
    result = await curated_corpus.verify_candidate({
        "isbn": "9780000000002", "discovery_source": "PUBLISHER_CATALOG",
        "source_url": "https://example.org/books/1",
        "source_context": {"title": "별의 이야기"},
    })
    assert result["status"] == "HOLD"
    assert result["reason"] == "SOURCE_TITLE_MISMATCH"


@pytest.mark.asyncio
async def test_short_kakao_description_uses_isbn_verified_library_text(monkeypatch):
    async def kakao(isbn):
        return {"isbn": isbn, "title": "별의 이야기", "authors": ["작가"], "contents": "짧음"}

    async def naru(isbn):
        return "우주선을 타고 새로운 행성을 탐험하는 인물들의 모험을 그린 장편 소설입니다."

    monkeypatch.setattr(curated_corpus, "fetch_kakao_exact", kakao)
    monkeypatch.setattr(curated_corpus, "fetch_naru_description", naru)
    result = await curated_corpus.verify_candidate({
        "isbn": "9780000000002", "discovery_source": "DATA4LIBRARY_POPULAR",
        "source_url": "https://www.data4library.kr/loanDataL",
    })
    assert result["status"] == "READY_FOR_REVIEW"
    assert result["candidate"]["description_source"] == "DATA4LIBRARY"
    assert result["book"]["contents"].startswith("우주선을")
