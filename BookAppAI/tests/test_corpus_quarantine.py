import asyncio
from unittest.mock import Mock

import httpx
import pytest

from app import corpus_policy
from app.main import app
from app.services import corpus_ingestion, embedding_backend, reranker, tagging_jobs
from app.services.gemini_tagger import GeminiTagger
from tools import backfill_gemini_embeddings, queue_retag


@pytest.mark.asyncio
async def test_unverified_inputs_stop_before_transport_or_queue(monkeypatch):
    transport = Mock(side_effect=AssertionError("external call during quarantine"))
    monkeypatch.setattr(httpx, "AsyncClient", transport)
    marker = "BLOCKED_KAKAO_TEST"
    for operation in (
        lambda: GeminiTagger().classify_book(marker, marker, marker),
        lambda: embedding_backend.gemini_embed(marker, "RETRIEVAL_DOCUMENT"),
        lambda: reranker.rerank_with_gemini(marker, [{"title": marker}]),
        lambda: reranker._rerank_with_groq(marker, [], {}, "test", "HTTP_503", None),
        lambda: backfill_gemini_embeddings.embed_documents([marker]),
        lambda: backfill_gemini_embeddings.run(apply=True, limit=1, pace=0, batch_size=1, cache_path=None),
        lambda: queue_retag.run(1, True, retry_failed=True),
        lambda: tagging_jobs.run_worker(asyncio.Event()),
        lambda: corpus_ingestion.run_worker(asyncio.Event()),
    ):
        with pytest.raises(corpus_policy.CorpusPermissionError, match=corpus_policy.HOLD_REASON):
            await operation()
    transport.assert_not_called()


@pytest.mark.asyncio
async def test_corpus_features_are_empty_without_a_database(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_TOKEN", "fixture")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver",
                                 headers={"X-Internal-Token": "fixture"}) as client:
        for path, payload, expected in [
            ("/api/books/reading-keyword-picks", {"keywords": ["소설"]}, []),
            ("/recommendations/content", {"user_books": []}, []),
        ]:
            response = await client.post(path, json=payload)
            assert response.status_code == 200
            assert response.json() == expected
