"""Compare current corpus embeddings with Gemini on one fixed local sample.

This tool never changes book_corpus. Vectors and results are written to /tmp by default.
"""

import argparse
import asyncio
import hashlib
import json
import os
import time
from pathlib import Path

import httpx
import numpy as np
from sqlalchemy import select

from app import database
from app.models.book_corpus import BookCorpus
from app.services import book_ai_service as svc
from app.services.reranker import _select_model_input
from app.services.search_retrieval import retrieve_candidates
from app.services.text_utils import build_book_text, is_search_candidate
from app.services.embedding_backend import provider as embedding_provider


MODEL = "gemini-embedding-001"
DIMENSIONS = 768
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:embedContent"
CASES = Path(__file__).parents[1] / "evaluation/representative_queries.json"
DEFAULT_CACHE = Path("/tmp/readonme-gemini-embedding-pilot-vectors.json")
DEFAULT_OUTPUT = Path("/tmp/readonme-gemini-embedding-pilot-results.json")


def _unit(values) -> np.ndarray:
    vector = np.asarray(values, dtype=np.float32)
    if vector.shape != (DIMENSIONS,) or not np.isfinite(vector).all():
        raise ValueError("Embedding must be a finite 768-dimensional vector")
    norm = np.linalg.norm(vector)
    if not norm:
        raise ValueError("Embedding has zero length")
    return vector / norm


def _write(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


async def _gemini_embedding(client: httpx.AsyncClient, api_key: str, content: str, task_type: str) -> tuple[list[float], float]:
    payload = {
        "model": f"models/{MODEL}", "content": {"parts": [{"text": content}]},
        "taskType": task_type, "outputDimensionality": DIMENSIONS,
    }
    for attempt in range(4):
        started = time.perf_counter()
        try:
            response = await client.post(API_URL, headers={"x-goog-api-key": api_key}, json=payload)
            if response.status_code in {429, 500, 502, 503, 504} and attempt < 3:
                await asyncio.sleep(min(30, 3 * 2 ** attempt))
                continue
            response.raise_for_status()
            values = response.json()["embedding"]["values"]
            return _unit(values).tolist(), (time.perf_counter() - started) * 1000
        except (httpx.TimeoutException, httpx.NetworkError):
            if attempt == 3:
                raise
            await asyncio.sleep(min(30, 3 * 2 ** attempt))
    raise RuntimeError("Gemini embedding attempts exhausted")


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self.rows


class _SampleDB:
    """Feed scored sample rows into the unchanged production retrieval function."""

    def __init__(self, rows):
        self.rows = rows

    async def execute(self, statement, params):
        sql = str(statement)
        rows = self.rows
        if "excluded_author" in params:
            excluded = params["excluded_author"].strip("%").replace("\\%", "%").replace("\\_", "_").casefold()
            rows = [row for row in rows if excluded not in (row.get("authors") or "").replace(" ", "").casefold()]
        if "classification_version LIKE" in sql:
            genre = params["genre"]
            rows = [row for row in rows if row["recommendation_status"] == "ACTIVE"
                    and row.get("source") == "CURATED_SEED"
                    and str(row.get("classification_version") or "").endswith(":reviewed")
                    and genre in {str(label).casefold() for label in [row.get("keyword"), *(row.get("tags") or [])]}]
        elif "keyword = ANY" in sql:
            keywords = set(params["keywords"])
            rows = [row for row in rows if row.get("keyword") in keywords
                    or bool(set(row.get("tags") or []) & keywords)]
        elif "title ILIKE" in sql:
            terms = [value.strip("%").casefold() for key, value in params.items() if key.startswith("title_")]
            rows = [row for row in rows if any(term in row["title"].casefold() for term in terms)]
        return _Result(sorted(rows, key=lambda row: (-row["similarity"], row["isbn"]))[:params["limit"]])


async def _candidate_report(books: list[dict], vectors: dict[str, np.ndarray], query_vector: np.ndarray, intent, keywords) -> dict:
    scored = []
    for book in books:
        scored.append({**book, "similarity": float(np.dot(vectors[book["isbn"]], query_vector))})
    candidates, counts = await retrieve_candidates(_SampleDB(scored), query_vector.tolist(), intent, keywords)
    filtered = [book for book in candidates if is_search_candidate(
        book, intent.genre, intent.domain, intent.requested_form, intent.constraints,
    )]
    filtered = svc._prefer_general_novels(svc._deduplicate_results(filtered), intent)
    model_input = _select_model_input(filtered, intent.genre)

    def summary(rows):
        return [{"isbn": row["isbn"], "title": row["title"],
                 "status": row["recommendation_status"],
                 "similarity": round(row["similarity"], 4)} for row in rows]

    return {
        "lanes": vars(counts), "vector_top10": summary(sorted(scored, key=lambda row: -row["similarity"])[:10]),
        "filtered_top10": summary(filtered[:10]), "model_input": summary(model_input),
    }


async def run(cache_path: Path, output_path: Path, random_count: int, pace: float) -> None:
    if embedding_provider() != "local":
        raise RuntimeError("Pilot compares against local vectors; set EMBEDDING_PROVIDER=local")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    cases = [case for case in json.loads(CASES.read_text())
             if case.get("query_type") not in {"author", "author_similar"}]
    database.init_db()
    await svc.init_embedding_model()
    try:
        async with database.async_session() as db:
            corpus = (await db.execute(select(BookCorpus).where(
                BookCorpus.recommendation_status.in_(["ACTIVE", "LEGACY"]),
            ))).scalars().all()
        books = [{
            "isbn": book.isbn, "title": book.title, "authors": book.authors,
            "contents": book.contents or "", "publisher": book.publisher,
            "keyword": book.keyword, "tags": book.tags or [],
            "source": book.source, "classification_version": book.classification_version,
            "recommendation_status": book.recommendation_status,
            "local_vector": _unit(book.embedding),
        } for book in corpus if book.embedding is not None and len((book.contents or "").strip()) >= 30]
        intents = [await svc.intent_analyzer.analyze(case["query"]) for case in cases]
        prompts = [svc.prompt_builder.build(intent, case["query"]) for intent, case in zip(intents, cases)]
        keywords = [svc._limit_keywords(await svc.keyword_expander.expand(intent)) for intent in intents]
        local_queries = [_unit(await svc.get_embedding(prompt)) for prompt in prompts]
        selected = {book["isbn"] for book in books if book["recommendation_status"] == "ACTIVE"}
        for query_vector in local_queries:
            ranked = sorted(books, key=lambda book: -float(np.dot(book["local_vector"], query_vector)))
            selected.update(book["isbn"] for book in ranked[:12])
        remaining = sorted((book for book in books if book["isbn"] not in selected),
                           key=lambda book: hashlib.sha256(f"embedding-pilot-v1:{book['isbn']}".encode()).hexdigest())
        selected.update(book["isbn"] for book in remaining[:random_count])
        sample = [book for book in books if book["isbn"] in selected]
        sample.sort(key=lambda book: book["isbn"])
        sample_hash = hashlib.sha256("|".join(book["isbn"] for book in sample).encode()).hexdigest()
        cache = json.loads(cache_path.read_text()) if cache_path.exists() else {
            "model": MODEL, "dimension": DIMENSIONS, "sample_hash": sample_hash,
            "books": {}, "queries": {}, "latency_ms": [], "input_chars": 0,
        }
        if (cache["model"], cache["dimension"], cache["sample_hash"]) != (MODEL, DIMENSIONS, sample_hash):
            raise ValueError("Existing cache belongs to a different model or sample")
        print(f"sample={len(sample)} queries={len(cases)} active={sum(b['recommendation_status']=='ACTIVE' for b in sample)}", flush=True)
        async with httpx.AsyncClient(timeout=20) as client:
            for index, book in enumerate(sample, 1):
                text = build_book_text(book["title"], book["contents"], book["authors"])
                entry = cache["books"].get(book["isbn"])
                digest = hashlib.sha256(text.encode()).hexdigest()
                if not entry or entry["input_hash"] != digest:
                    vector, latency = await _gemini_embedding(client, api_key, text, "RETRIEVAL_DOCUMENT")
                    cache["books"][book["isbn"]] = {"input_hash": digest, "vector": vector}
                    cache["latency_ms"].append(latency)
                    cache["input_chars"] += len(text)
                    if index % 10 == 0:
                        _write(cache_path, cache)
                    await asyncio.sleep(pace)
                if index % 25 == 0:
                    print(f"books_done={index}/{len(sample)}", flush=True)
            for case, prompt in zip(cases, prompts):
                digest = hashlib.sha256(prompt.encode()).hexdigest()
                entry = cache["queries"].get(case["query"])
                if not entry or entry["input_hash"] != digest:
                    vector, latency = await _gemini_embedding(client, api_key, prompt, "RETRIEVAL_QUERY")
                    cache["queries"][case["query"]] = {"input_hash": digest, "vector": vector}
                    cache["latency_ms"].append(latency)
                    cache["input_chars"] += len(prompt)
                    _write(cache_path, cache)
                    await asyncio.sleep(pace)
        _write(cache_path, cache)

        public_books = [{key: value for key, value in book.items() if key != "local_vector"} for book in sample]
        local_vectors = {book["isbn"]: book["local_vector"] for book in sample}
        gemini_vectors = {book["isbn"]: _unit(cache["books"][book["isbn"]]["vector"]) for book in sample}
        results = []
        for case, intent, terms, local_query in zip(cases, intents, keywords, local_queries):
            query = case["query"]
            local = await _candidate_report(public_books, local_vectors, local_query, intent, terms)
            gemini = await _candidate_report(public_books, gemini_vectors,
                                              _unit(cache["queries"][query]["vector"]), intent, terms)
            local_ids = {book["isbn"] for book in local["model_input"]}
            gemini_ids = {book["isbn"] for book in gemini["model_input"]}
            results.append({"query": query, "keywords": terms, "local": local, "gemini": gemini,
                            "model_input_overlap": len(local_ids & gemini_ids),
                            "forbidden_titles": case.get("forbidden_titles", [])})
        report = {
            "model": MODEL, "dimensions": DIMENSIONS, "sample_count": len(sample),
            "sample_hash": sample_hash, "sample_isbns": [book["isbn"] for book in sample],
            "sample_active": sum(book["recommendation_status"] == "ACTIVE" for book in sample),
            "query_count": len(cases), "gemini_requests": len(cache["latency_ms"]),
            "gemini_input_characters": cache["input_chars"],
            "gemini_latency_ms": {
                "p50": round(float(np.percentile(cache["latency_ms"], 50)), 1),
                "p95": round(float(np.percentile(cache["latency_ms"], 95)), 1),
            },
            "results": results,
        }
        _write(output_path, report)
        print(f"output={output_path} cache={cache_path}", flush=True)
    finally:
        await database.engine.dispose()
        svc.shutdown_embedding_model()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--random-count", type=int, default=80)
    parser.add_argument("--pace", type=float, default=0.7)
    args = parser.parse_args()
    if not 0 <= args.random_count <= 300 or args.pace < 0:
        parser.error("random-count must be 0–300 and pace nonnegative")
    asyncio.run(run(args.cache, args.output, args.random_count, args.pace))
