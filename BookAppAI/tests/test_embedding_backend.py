import math

import httpx
import pytest

from app.services import book_ai_service, embedding_backend


def test_provider_selects_one_fixed_database_column(monkeypatch):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "local")
    assert embedding_backend.column() == "embedding"
    assert embedding_backend.write_values([1.0]) == {"embedding": [1.0]}
    monkeypatch.setenv("EMBEDDING_PROVIDER", "gemini")
    assert embedding_backend.column() == "gemini_embedding"
    assert embedding_backend.write_values([1.0]) == {"gemini_embedding": [1.0]}
    monkeypatch.setenv("EMBEDDING_PROVIDER", "unsafe_column")
    with pytest.raises(ValueError):
        embedding_backend.column()


@pytest.mark.asyncio
async def test_gemini_embedding_uses_retrieval_task_and_normalizes(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-only-key")
    observed = []
    original_client = httpx.AsyncClient

    def respond(request):
        observed.append(request)
        return httpx.Response(200, json={"embedding": {"values": [2.0] * 768}})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(respond), timeout=kwargs.get("timeout"),
    ))
    vector = await embedding_backend.gemini_embed("책 소개", "RETRIEVAL_DOCUMENT")
    assert len(vector) == 768
    assert math.isclose(sum(value * value for value in vector), 1.0)
    assert observed[0].headers["x-goog-api-key"] == "test-only-key"
    assert '"taskType":"RETRIEVAL_DOCUMENT"' in observed[0].content.decode()
    assert '"outputDimensionality":768' in observed[0].content.decode()


@pytest.mark.asyncio
async def test_gemini_embedding_retries_once_and_rejects_bad_vectors(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-only-key")
    original_client = httpx.AsyncClient
    attempts = 0

    def respond(request):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503)
        return httpx.Response(200, json={"embedding": {"values": [0.0] * 768}})

    async def no_delay(seconds):
        pass

    monkeypatch.setattr(embedding_backend.asyncio, "sleep", no_delay)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(respond), timeout=kwargs.get("timeout"),
    ))
    with pytest.raises(ValueError, match="zero length"):
        await embedding_backend.gemini_embed("검색어", "RETRIEVAL_QUERY")
    assert attempts == 2


@pytest.mark.asyncio
async def test_gemini_mode_skips_local_model_and_uses_query_task(monkeypatch):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-only-key")
    monkeypatch.setattr(book_ai_service, "_load_embedding_model", lambda: (_ for _ in ()).throw(
        AssertionError("local model loaded"),
    ))
    observed = []

    async def embed(text, task_type):
        observed.append((text, task_type))
        return [0.1]

    monkeypatch.setattr(book_ai_service, "gemini_embed", embed)
    await book_ai_service.init_embedding_model()
    assert await book_ai_service.get_embedding("검색어") == [0.1]
    assert observed == [("검색어", "RETRIEVAL_QUERY")]


@pytest.mark.asyncio
async def test_rate_limited_embedding_reports_retryable_ingestion_code(monkeypatch):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "gemini")

    async def rate_limited(*args):
        request = httpx.Request("POST", embedding_backend.GEMINI_EMBEDDING_URL)
        response = httpx.Response(429, request=request)
        raise httpx.HTTPStatusError("rate limited", request=request, response=response)

    monkeypatch.setattr(book_ai_service, "gemini_embed", rate_limited)
    error = {}
    assert await book_ai_service.get_embedding("책 소개", "RETRIEVAL_DOCUMENT", error) is None
    assert error == {"code": "RATE_LIMIT"}
