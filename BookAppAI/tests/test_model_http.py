import asyncio
import threading

import httpx
import pytest

from app.services import model_http


@pytest.mark.asyncio
async def test_cold_client_setup_allows_other_requests_and_reuses_the_tls_context(monkeypatch):
    loop = asyncio.get_running_loop()
    started = asyncio.Event()
    resume = threading.Event()
    builds = []
    original = httpx.create_ssl_context

    def slow_trust_store():
        loop.call_soon_threadsafe(started.set)
        assert resume.wait(5), "TLS setup blocked the serving loop"
        builds.append(threading.get_ident())
        return original()

    model_http.model_tls_context.cache_clear()
    monkeypatch.setattr(httpx, "create_ssl_context", slow_trust_store)
    try:
        first = asyncio.create_task(model_http.model_http_client(3))
        await asyncio.wait_for(started.wait(), 5)
        resume.set()
        async with await first as client:
            assert client.timeout.read == 3
        async with await model_http.model_http_client(7) as client:
            assert client.timeout.read == 7
        assert len(builds) == 1 and builds[0] != threading.get_ident()
    finally:
        resume.set()
        model_http.model_tls_context.cache_clear()
