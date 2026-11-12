"""Discover ISBNs independently of a keyword and verify exact book metadata."""

from __future__ import annotations

import os
import re
from datetime import date
from typing import Any

import httpx

from app.services.corpus_metadata import fetch_naru_description
from app.services.corpus_quality import normalize_isbn, preflight_candidate


NARU_POPULAR_URL = "https://data4library.kr/api/loanItemSrch"
KAKAO_BOOK_URL = "https://dapi.kakao.com/v3/search/book"


def _exact_isbn(value: str, expected: str) -> bool:
    return any(normalize_isbn(token) == expected for token in re.split(r"[\s,;/]+", value or ""))


def _same_title(expected: str, actual: str) -> bool:
    left = re.sub(r"[\W_]+", "", expected).casefold()
    right = re.sub(r"[\W_]+", "", actual).casefold()
    return len(left) >= 4 and len(right) >= 4 and (left in right or right in left)


def _clean_candidate(item: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    isbn = normalize_isbn(str(item.get("isbn") or item.get("isbn13") or ""))
    source = str(item.get("discovery_source") or "").strip()
    url = str(item.get("source_url") or "").strip()
    if not isbn or not source or not url.startswith(("https://", "http://")):
        return None
    return {
        "isbn": isbn,
        "discovery_source": source[:60],
        "source_url": url[:500],
        "target_subject": str(item.get("target_subject") or "").strip()[:60],
        "source_context": item.get("source_context") if isinstance(item.get("source_context"), dict) else {},
    }


async def discover_naru_popular(
    *, kdc: str, start_date: date, end_date: date, pages: list[int],
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    key = os.getenv("LIBRARY_BIGDATA_API_KEY")
    if not key:
        raise RuntimeError("LIBRARY_BIGDATA_API_KEY is required for library discovery")
    if not re.fullmatch(r"\d{1,3}", kdc) or start_date > end_date or not pages or any(
        page < 1 or page > 100 for page in pages
    ):
        raise ValueError("Provide a KDC code, ordered dates, and page numbers 1–100")

    own_client = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=3.0))
    found: dict[str, dict[str, Any]] = {}
    try:
        for page in pages:
            response = await client.get(NARU_POPULAR_URL, params={
                "authKey": key, "startDt": start_date.isoformat(), "endDt": end_date.isoformat(),
                "kdc": kdc, "pageNo": page, "pageSize": 50, "format": "json",
            })
            response.raise_for_status()
            body = response.json()
            docs = (body.get("response") or {}).get("docs")
            if not isinstance(docs, list):
                raise ValueError("Library discovery returned an unexpected document list")
            for wrapped in docs:
                book = wrapped.get("doc") if isinstance(wrapped, dict) else None
                if not isinstance(book, dict):
                    continue
                candidate = _clean_candidate({
                    "isbn": book.get("isbn13"), "discovery_source": "DATA4LIBRARY_POPULAR",
                    "source_url": "https://www.data4library.kr/loanDataL",
                    "target_subject": kdc,
                    "source_context": {
                        "kdc": kdc, "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(), "page": page,
                        "rank": book.get("ranking"), "title": book.get("bookname"),
                    },
                })
                if candidate:
                    found.setdefault(candidate["isbn"], candidate)
    finally:
        if own_client:
            await client.aclose()
    return list(found.values())


async def fetch_kakao_exact(isbn: str, client: httpx.AsyncClient | None = None) -> dict[str, Any] | None:
    key = os.getenv("KAKAO_API_KEY")
    if not key:
        raise RuntimeError("KAKAO_API_KEY is required for ISBN metadata verification")
    own_client = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=3.0))
    try:
        response = await client.get(
            KAKAO_BOOK_URL, headers={"Authorization": f"KakaoAK {key}"},
            params={"query": isbn, "target": "isbn", "size": 20},
        )
        response.raise_for_status()
        for book in response.json().get("documents") or []:
            if isinstance(book, dict) and _exact_isbn(str(book.get("isbn") or ""), isbn):
                return {
                    "isbn": isbn, "title": book.get("title") or "",
                    "authors": book.get("authors") or [],
                    "publisher": book.get("publisher") or "",
                    "thumbnail": book.get("thumbnail") or "",
                    "contents": book.get("contents") or "",
                }
        return None
    finally:
        if own_client:
            await client.aclose()


async def verify_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    candidate = _clean_candidate(candidate)
    if candidate is None:
        raise ValueError("Candidate needs a valid ISBN and discovery source")
    book = await fetch_kakao_exact(candidate["isbn"])
    if book is None:
        return {"candidate": candidate, "status": "HOLD", "reason": "ISBN_METADATA_NOT_FOUND"}
    expected_title = candidate["source_context"].get("title")
    if expected_title and not _same_title(str(expected_title), str(book.get("title") or "")):
        return {"candidate": candidate, "book": book, "status": "HOLD", "reason": "SOURCE_TITLE_MISMATCH"}
    if len(str(book.get("contents") or "")) < 120:
        description = await fetch_naru_description(candidate["isbn"])
        if description and len(description) > len(str(book.get("contents") or "")):
            book["contents"] = description
            candidate["description_source"] = "DATA4LIBRARY"
    gate = preflight_candidate(book)
    if gate:
        return {"candidate": candidate, "book": book, "status": gate[0], "reason": gate[1]}
    return {"candidate": candidate, "book": book, "status": "READY_FOR_REVIEW"}
