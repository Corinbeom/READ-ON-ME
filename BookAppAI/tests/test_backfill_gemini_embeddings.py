import json
import math

import httpx
import pytest

from tools import backfill_gemini_embeddings as backfill


@pytest.mark.asyncio
async def test_batch_backfill_preserves_document_order_and_normalizes(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-only-key")
    original_client = httpx.AsyncClient

    def respond(request):
        payload = json.loads(request.content)
        assert [item["content"]["parts"][0]["text"] for item in payload["requests"]] == ["first", "second"]
        assert all(item["taskType"] == "RETRIEVAL_DOCUMENT" for item in payload["requests"])
        assert all(item["outputDimensionality"] == 768 for item in payload["requests"])
        return httpx.Response(200, json={"embeddings": [
            {"values": [2.0] + [0.0] * 767},
            {"values": [0.0, 3.0] + [0.0] * 766},
        ]})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(respond), timeout=kwargs.get("timeout"),
    ))
    vectors = await backfill.embed_documents(["first", "second"])
    assert len(vectors) == 2
    assert math.isclose(vectors[0][0], 1.0)
    assert math.isclose(vectors[1][1], 1.0)
