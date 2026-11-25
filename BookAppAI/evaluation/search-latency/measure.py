"""Run in a graded disposable DB. Output timings plus ordered ISBNs, never book text or secrets."""
import argparse
import asyncio
from contextlib import ExitStack
import json
from time import perf_counter
from unittest.mock import patch

from fastapi import Response
from sqlalchemy import event
from app import database
from app.routers import data_builder
from app.schemas import AiSearchRequest
from app.services import embedding_backend, reranker
from app.services.reviewed_release import fingerprint

QUERY = "아이가 화가 나서 울 때 서로 말이 안 통해요. 실제 부모와 아이의 대화 예시가 많은 책 있을까요?"


async def main(args):
    database.init_db()
    try:
        async with database.async_session() as db:
            release, count = await fingerprint(db)
        stats = {}

        @event.listens_for(database.engine.sync_engine, "before_cursor_execute")
        def count_statement(*_):
            stats["sql"] += 1

        def meter(call, key):
            async def measured(*args, **kwargs):
                start = perf_counter()
                try:
                    return await call(*args, **kwargs)
                finally:
                    stats[key] += (perf_counter() - start) * 1000
            return measured

        async def fixed_embed(*args):
            return [1.0] + [0.0] * 767

        async def fixed_rank(query, books, **kwargs):
            kwargs["outcome"].update(status="MODEL", reason_code="NONE")
            return books

        with ExitStack() as stack:
            # Both revisions enforce the graded release inside the normal search endpoint.
            gate = "require_index" if hasattr(data_builder, "require_index") else "require_release"
            stack.enter_context(patch.object(data_builder, gate, meter(getattr(data_builder, gate), "index_ms")))
            for module, name, key, fixture in (
                (embedding_backend, "_embed", "embed_ms", fixed_embed),
                (reranker, "_rank_candidates", "model_ms", fixed_rank),
            ):
                call = getattr(module, name) if args.live else fixture
                stack.enter_context(patch.object(module, name, meter(call, key)))
            for i in range(args.runs + 1):
                stats.update(index_ms=0.0, sql=0, embed_ms=0.0, model_ms=0.0)
                async with database.async_session() as db:
                    response = Response()
                    start = perf_counter()
                    books = await data_builder.ai_search(AiSearchRequest(query=QUERY), response, release, db, release)
                    elapsed = (perf_counter() - start) * 1000
                print(json.dumps(dict(warmup=i == 0, books=count, release=release, total_ms=elapsed,
                                      **stats, outcome=response.headers["X-Search-Outcome"],
                                      results=[b["isbn"] for b in books])), flush=True)
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--live", action="store_true", help="call the configured providers and store normal reason receipts")
    asyncio.run(main(parser.parse_args()))
