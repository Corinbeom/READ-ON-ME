"""Resume-safe Gemini shadow-vector backfill for searchable corpus books.

Run Alembic first. By default this only reports progress; --apply writes missing
Gemini vectors without modifying any local vectors.
"""

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path

import httpx
from sqlalchemy import func, select, update

from app import database
from app.models.book_corpus import BookCorpus
from app.services.embedding_backend import (
    EMBEDDING_DIMENSIONS, GEMINI_EMBEDDING_MODEL, normalize,
)
from app.services.text_utils import build_book_text


DEFAULT_CACHE = Path("/tmp/readonme-gemini-embedding-pilot-vectors.json")
SEARCHABLE = ("ACTIVE", "LEGACY")
BATCH_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_EMBEDDING_MODEL}:batchEmbedContents"


async def embed_documents(contents: list[str]) -> list[list[float]]:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is required for backfill")
    payload = {"requests": [
        {"model": f"models/{GEMINI_EMBEDDING_MODEL}",
         "content": {"parts": [{"text": content}]},
         "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": EMBEDDING_DIMENSIONS}
        for content in contents
    ]}
    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(3):
            try:
                response = await client.post(BATCH_URL, headers={"x-goog-api-key": key}, json=payload)
                if response.status_code in {429, 500, 502, 503, 504} and attempt < 2:
                    await asyncio.sleep((20, 40)[attempt] if response.status_code == 429 else 2 ** attempt)
                    continue
                response.raise_for_status()
                embeddings = response.json()["embeddings"]
                if len(embeddings) != len(contents):
                    raise ValueError("Gemini batch returned the wrong number of vectors")
                return [normalize(item["values"]) for item in embeddings]
            except (httpx.TimeoutException, httpx.NetworkError):
                if attempt == 2:
                    raise
                await asyncio.sleep(2 ** attempt)
    raise RuntimeError("Gemini batch embedding attempts exhausted")


def load_pilot_cache(path: Path | None) -> dict:
    if path is None or not path.exists():
        return {}
    cache = json.loads(path.read_text())
    if cache.get("model") != GEMINI_EMBEDDING_MODEL or cache.get("dimension") != EMBEDDING_DIMENSIONS:
        raise ValueError("Pilot cache has a different embedding model or dimension")
    return cache.get("books", {})


async def run(*, apply: bool, limit: int, pace: float, batch_size: int, cache_path: Path | None) -> None:
    database.init_db()
    try:
        async with database.async_session() as db:
            base = select(BookCorpus).where(BookCorpus.recommendation_status.in_(SEARCHABLE))
            total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
            missing = (await db.execute(select(func.count()).select_from(
                base.where(BookCorpus.gemini_embedding.is_(None)).subquery()
            ))).scalar_one()
            rows = (await db.execute(
                select(BookCorpus.id, BookCorpus.isbn, BookCorpus.title,
                       BookCorpus.contents, BookCorpus.authors)
                .where(BookCorpus.recommendation_status.in_(SEARCHABLE))
                .where(BookCorpus.gemini_embedding.is_(None))
                .order_by(BookCorpus.id).limit(limit)
            )).all()
        print(f"searchable={total} missing={missing} selected={len(rows)} apply={apply}", flush=True)
        if not apply:
            return
        cache = load_pilot_cache(cache_path)
        cached_count = api_count = batch_calls = 0
        for start in range(0, len(rows), batch_size):
            chunk = rows[start:start + batch_size]
            vectors: dict[int, list[float]] = {}
            uncached = []
            for row in chunk:
                content = build_book_text(row.title, row.contents or "", row.authors)
                digest = hashlib.sha256(content.encode()).hexdigest()
                entry = cache.get(row.isbn)
                if entry and entry.get("input_hash") == digest:
                    vectors[row.id] = normalize(entry["vector"])
                    cached_count += 1
                else:
                    uncached.append((row, content))
            if uncached:
                embedded = await embed_documents([content for _, content in uncached])
                vectors.update((row.id, vector) for (row, _), vector in zip(uncached, embedded))
                api_count += len(uncached)
                batch_calls += 1
            for row in chunk:
                async with database.async_session() as db:
                    await db.execute(
                        update(BookCorpus).where(BookCorpus.id == row.id)
                        .where(BookCorpus.gemini_embedding.is_(None))
                        .where(BookCorpus.title == row.title)
                        .where(BookCorpus.contents.is_not_distinct_from(row.contents))
                        .where(BookCorpus.authors.is_not_distinct_from(row.authors))
                        .values(gemini_embedding=vectors[row.id])
                    )
                    await db.commit()
            done = start + len(chunk)
            if done % 25 < batch_size or done == len(rows):
                print(f"done={done}/{len(rows)} cache={cached_count} api_books={api_count} batch_calls={batch_calls}", flush=True)
            if uncached:
                await asyncio.sleep(pace)
        async with database.async_session() as db:
            remaining = (await db.execute(select(func.count()).select_from(BookCorpus).where(
                BookCorpus.recommendation_status.in_(SEARCHABLE),
                BookCorpus.gemini_embedding.is_(None),
            ))).scalar_one()
        print(f"remaining={remaining}", flush=True)
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--pace", type=float, default=10.0)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    args = parser.parse_args()
    if args.limit < 1 or args.pace < 0 or not 1 <= args.batch_size <= 16:
        parser.error("limit must be positive, pace nonnegative, and batch-size between 1 and 16")
    asyncio.run(run(apply=args.apply, limit=args.limit, pace=args.pace,
                    batch_size=args.batch_size, cache_path=args.cache))
