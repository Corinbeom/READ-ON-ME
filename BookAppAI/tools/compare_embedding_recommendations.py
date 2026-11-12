"""Run the same Gemini reranker on paired local/Gemini embedding candidate lists.

Read-only against book_corpus. Uses the cached pilot's candidate-selection result.
"""

import argparse
import asyncio
import json
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import select

load_dotenv()

from app import database  # noqa: E402
from app.models.book_corpus import BookCorpus  # noqa: E402
from app.services.intent_classifier import IntentAnalyzer  # noqa: E402
from app.services.reranker import rerank_with_gemini  # noqa: E402


DEFAULT_INPUT = Path("/tmp/readonme-gemini-embedding-pilot-after-constraints.json")
DEFAULT_OUTPUT = Path("/tmp/readonme-gemini-embedding-final-ab.json")
DEFAULT_QUERIES = (
    "따뜻한 이야기를 읽고 싶어",
    "어두운 분위기의 책",
    "SF 소설 추천",
    "감성적인 에세이",
    "한국소설 추천",
)


async def run(input_path: Path, output_path: Path, pace: float, queries: tuple[str, ...], models: tuple[str, ...]) -> None:
    pilot = json.loads(input_path.read_text())
    cases = [case for case in pilot["results"] if case["query"] in queries]
    if len(cases) != len(queries):
        raise ValueError("Pilot result is missing a representative query")
    isbns = {book["isbn"] for case in cases for model in ("local", "gemini")
            for book in case[model]["model_input"]}
    database.init_db()
    try:
        async with database.async_session() as db:
            rows = (await db.execute(select(BookCorpus).where(BookCorpus.isbn.in_(isbns)))).scalars().all()
        books = {row.isbn: {
            "isbn": row.isbn, "title": row.title, "authors": row.authors,
            "contents": row.contents or "", "keyword": row.keyword, "tags": row.tags or [],
            "source": row.source, "classification_version": row.classification_version,
            "recommendation_status": row.recommendation_status,
        } for row in rows}
        if set(books) != isbns:
            raise ValueError("Some pilot candidate ISBNs are missing from book_corpus")
        analyzer = IntentAnalyzer()
        result = {"sample_hash": pilot["sample_hash"], "reranker_cases": []}
        for case in cases:
            intent = await analyzer.analyze(case["query"])
            paired = {"query": case["query"], "models": {}}
            for model in models:
                candidates = [books[book["isbn"]] for book in case[model]["model_input"]]
                outcome = {}
                selected = await rerank_with_gemini(
                    case["query"], candidates, intent.requested_form,
                    genre=None, outcome=outcome,
                )
                paired["models"][model] = {
                    "outcome": outcome,
                    "books": [{"isbn": book["isbn"], "title": book["title"],
                               "reason": book.get("reason"), "ranking_status": book.get("ranking_status")}
                              for book in selected],
                }
                print(f"{case['query']} {model}: {outcome.get('status')} {len(selected)}", flush=True)
                await asyncio.sleep(pace)
            result["reranker_cases"].append(paired)
            output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--pace", type=float, default=6.0)
    parser.add_argument("--query", action="append", choices=DEFAULT_QUERIES,
                        help="Run only a named representative query (repeatable)")
    parser.add_argument("--model", action="append", choices=("local", "gemini"),
                        help="Run only one embedding candidate set (repeatable)")
    args = parser.parse_args()
    if args.pace < 0:
        parser.error("pace must be nonnegative")
    asyncio.run(run(args.input, args.output, args.pace, tuple(args.query or DEFAULT_QUERIES),
                    tuple(args.model or ("local", "gemini"))))
