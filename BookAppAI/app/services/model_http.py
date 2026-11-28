"""Prepare the model providers' TLS trust store without blocking the serving event loop."""

import asyncio
from functools import lru_cache

import httpx


@lru_cache(maxsize=1)
def model_tls_context():
    return httpx.create_ssl_context()


async def model_http_client(timeout):
    def build():
        return httpx.AsyncClient(verify=model_tls_context(), timeout=timeout)

    return await asyncio.to_thread(build)
