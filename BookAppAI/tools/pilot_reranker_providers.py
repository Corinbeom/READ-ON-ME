"""Compare Gemini and Groq on the same small, previously reviewed candidate sets."""

import argparse
import asyncio
import json
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "BookAppAI/.env", override=False)

from app.services import reranker  # noqa: E402

DEFAULT_INPUT = ROOT / "BookAppAI/evaluation/search_quality_baseline_2026-11-11.json"
DEFAULT_OUTPUT = Path("/tmp/readonme-reranker-provider-pilot.json")
DEFAULT_CASES = (0, 7, 8, 11)


def _books(case: dict) -> list[dict]:
    return [
        {"isbn": str(book["isbn"]), "title": book.get("title") or "",
         "authors": book.get("authors") or "", "contents": book.get("contents_excerpt") or ""}
        for book in case["books"] if book.get("isbn")
    ]


def _summarize(books: list[dict] | None) -> list[dict] | None:
    if books is None:
        return None
    return [
        {"isbn": book["isbn"], "title": book["title"],
         "reason": book.get("reason"), "reason_evidence": book.get("reason_evidence"),
         "grounded_reason": bool(book.get("reason") and book.get("reason_evidence"))}
        for book in books
    ]


async def _gemini(prompt: str, books: list[dict], evidence: dict[str, str]) -> dict:
    payload = {
        "contents": [{"parts": [{"text": prompt + "\n\n결과는 JSON 배열로 반환하세요. 적합한 책이 없으면 빈 배열로 답하세요."}]}],
        "generationConfig": {
            "temperature": 0.2, "maxOutputTokens": 1200,
            "responseMimeType": "application/json", "responseSchema": reranker.SELECTION_SCHEMA,
        },
    }
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=reranker.RERANK_TIMEOUT) as client:
            response = await client.post(
                f"{reranker.GEMINI_API_BASE}/models/{reranker.RERANK_MODEL}:generateContent",
                params={"key": reranker.GEMINI_API_KEY}, json=payload,
            )
        if response.status_code >= 400:
            return {"status": f"HTTP_{response.status_code}", "latency_ms": round((time.perf_counter() - started) * 1000)}
        data = response.json()
        raw = data["candidates"][0]["content"]["parts"][0]["text"]
        diagnostics = {}
        selected = reranker._parse_selection(raw, books, evidence, diagnostics)
        usage = data.get("usageMetadata") or {}
        return {
            "status": "MODEL" if selected is not None else "INVALID_SELECTION",
            "latency_ms": round((time.perf_counter() - started) * 1000),
            "usage": {"input_tokens": usage.get("promptTokenCount"),
                      "output_tokens": usage.get("candidatesTokenCount")},
            "books": _summarize(selected), "reason_rejections": diagnostics.get("reason_rejections", []),
        }
    except Exception as exc:
        return {"status": type(exc).__name__, "latency_ms": round((time.perf_counter() - started) * 1000)}


async def _groq(prompt: str, books: list[dict], evidence: dict[str, str], case_id: int) -> dict:
    diagnostics = {}
    started = time.perf_counter()
    selected = await reranker._rerank_with_groq(prompt, books, evidence, f"pilot-{case_id}", "PILOT", diagnostics)
    return {
        "status": "MODEL" if selected is not None else diagnostics.get("groq_error_reason", "SKIPPED"),
        "latency_ms": round((time.perf_counter() - started) * 1000),
        "usage": diagnostics.get("groq_usage"), "books": _summarize(selected),
        "reason_rejections": diagnostics.get("reason_rejections", []),
    }


async def run(source: Path, output: Path, case_indices: tuple[int, ...], delay: float) -> None:
    if not reranker.GEMINI_API_KEY or not os.getenv("GROQ_API_KEY"):
        raise RuntimeError("Both GEMINI_API_KEY and GROQ_API_KEY are required")
    cases = json.loads(source.read_text())
    records = []
    for position, case_index in enumerate(case_indices):
        case = cases[case_index]
        books = _books(case)
        if case.get("expected", {}).get("genre") == "소설" and not reranker.requests_school_anthology(case["query"]):
            books = [book for book in books if not reranker.is_school_anthology(book)]
        evidence = {book["isbn"]: reranker._book_evidence(book) for book in books}
        book_list = [
            {"isbn": book["isbn"], "title": book["title"], "authors": book["authors"],
             "evidence": evidence[book["isbn"]]} for book in books
        ]
        prompt = reranker._selection_prompt(case["query"], book_list, "")
        gemini = await _gemini(prompt, books, evidence)
        groq = await _groq(prompt, books, evidence, case_index + 1)
        records.append({
            "query": case["query"], "source_case_index": case_index + 1,
            "candidate_isbns": [book["isbn"] for book in books],
            "candidate_source": "previously selected results with 240-character description excerpts",
            "gemini": gemini, "groq": groq,
        })
        output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
        print(f"case={case_index + 1} gemini={gemini['status']} groq={groq['status']} output={output}", flush=True)
        if position + 1 < len(case_indices):
            await asyncio.sleep(delay)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cases", type=int, nargs="+", default=DEFAULT_CASES,
                        help="Zero-based indices from the source evaluation file")
    parser.add_argument("--delay", type=float, default=30.0, help="Seconds between cases")
    args = parser.parse_args()
    if args.delay < 0 or any(index < 0 for index in args.cases):
        parser.error("Case indices and delay must be nonnegative")
    asyncio.run(run(args.source, args.output, tuple(args.cases), args.delay))
