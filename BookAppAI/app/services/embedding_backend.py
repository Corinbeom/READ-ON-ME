"""Select one embedding space for every corpus read and write."""

import asyncio
import math
import os

import httpx


GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768
GEMINI_EMBEDDING_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_EMBEDDING_MODEL}:embedContent"
)
RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def provider() -> str:
    selected = os.getenv("EMBEDDING_PROVIDER", "local").strip().lower()
    if selected not in {"local", "gemini"}:
        raise ValueError("EMBEDDING_PROVIDER must be 'local' or 'gemini'")
    return selected


def column() -> str:
    """Return a fixed SQL identifier, never caller-supplied text."""
    return "gemini_embedding" if provider() == "gemini" else "embedding"


def write_values(vector: list[float]) -> dict:
    return {column(): vector}


def normalize(values: list[float]) -> list[float]:
    if len(values) != EMBEDDING_DIMENSIONS or not all(math.isfinite(value) for value in values):
        raise ValueError("Embedding must contain 768 finite values")
    norm = math.sqrt(sum(value * value for value in values))
    if norm == 0:
        raise ValueError("Embedding has zero length")
    return [value / norm for value in values]


async def gemini_embed(text: str, task_type: str) -> list[float]:
    if task_type not in {"RETRIEVAL_QUERY", "RETRIEVAL_DOCUMENT"}:
        raise ValueError("Unsupported Gemini embedding task type")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required for Gemini embeddings")
    payload = {
        "model": f"models/{GEMINI_EMBEDDING_MODEL}",
        "content": {"parts": [{"text": text}]},
        "taskType": task_type,
        "outputDimensionality": EMBEDDING_DIMENSIONS,
    }
    timeout = float(os.getenv("GEMINI_EMBEDDING_TIMEOUT_SECONDS", "5"))
    if timeout <= 0:
        raise ValueError("GEMINI_EMBEDDING_TIMEOUT_SECONDS must be positive")
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(2):
            try:
                response = await client.post(
                    GEMINI_EMBEDDING_URL,
                    headers={"x-goog-api-key": api_key}, json=payload,
                )
                if response.status_code in RETRYABLE_STATUS and attempt == 0:
                    await asyncio.sleep(0.5)
                    continue
                response.raise_for_status()
                return normalize(response.json()["embedding"]["values"])
            except (httpx.TimeoutException, httpx.NetworkError):
                if attempt:
                    raise
                await asyncio.sleep(0.5)
    raise RuntimeError("Gemini embedding attempts exhausted")
