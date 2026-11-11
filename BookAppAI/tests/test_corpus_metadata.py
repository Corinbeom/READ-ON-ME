import pytest

from app.services import corpus_metadata


@pytest.mark.asyncio
async def test_naru_description_requires_exact_isbn_and_real_text(monkeypatch):
    monkeypatch.setenv("LIBRARY_BIGDATA_API_KEY", "test-key")

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"response": {"detail": [
                {"book": {"isbn13": "9780306406157", "description": "다른 책의 아주 긴 소개가 들어 있습니다. " * 3}},
                {"book": {"isbn13": "9780000000002", "description": "<p>과학 지식을 일상의 실험과 연결하는 책입니다.</p> 초등학생을 위한 설명을 담았습니다."}},
            ]}}

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url, *, params):
            assert url == corpus_metadata.NARU_DETAIL_URL
            assert params["isbn13"] == "9780000000002"
            return Response()

    monkeypatch.setattr(corpus_metadata.httpx, "AsyncClient", lambda **kwargs: Client())
    result = await corpus_metadata.fetch_naru_description("9780000000002")
    assert result == "과학 지식을 일상의 실험과 연결하는 책입니다. 초등학생을 위한 설명을 담았습니다."


@pytest.mark.asyncio
async def test_naru_description_is_optional_without_key(monkeypatch):
    monkeypatch.delenv("LIBRARY_BIGDATA_API_KEY", raising=False)
    assert await corpus_metadata.fetch_naru_description("9780000000002") is None
