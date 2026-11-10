from datetime import timedelta

import httpx
import pytest

from app.services import llm_cooldown
from app.services.gemini_tagger import GeminiTagger
from app.services.tagging_jobs import failure_retry_policy, retry_delay


def test_retry_delay_is_bounded_and_increases():
    assert retry_delay(1) == timedelta(seconds=60)
    assert retry_delay(2) == timedelta(seconds=120)
    assert retry_delay(3) == timedelta(seconds=240)
    assert retry_delay(20) == timedelta(seconds=3600)


def test_rate_limit_is_retried_even_after_three_attempts():
    assert failure_retry_policy(3, "RATE_LIMIT") == ("RETRY", timedelta(minutes=5))
    assert failure_retry_policy(10, "RATE_LIMIT") == ("RETRY", timedelta(hours=1))


def test_auth_error_pauses_for_manual_requeue():
    assert failure_retry_policy(1, "AUTH_ERROR")[0] == "FAILED"
    assert failure_retry_policy(3, "TIMEOUT")[0] == "FAILED"


@pytest.mark.asyncio
@pytest.mark.parametrize("status,code", [(429, "RATE_LIMIT"), (401, "AUTH_ERROR")])
async def test_tagger_records_api_failure_type(monkeypatch, status, code):
    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(status))
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(transport=transport, timeout=kwargs.get("timeout")))
    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    tagger = GeminiTagger(api_key="test-only-key")
    assert await tagger.classify_book("제목", "설명", "작가") is None
    assert tagger.last_error_code == code
    if status == 429:
        assert not llm_cooldown.available()
