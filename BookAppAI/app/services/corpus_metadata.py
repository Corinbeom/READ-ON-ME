"""Optional, ISBN-verified source metadata for sparse corpus candidates."""

import html
import logging
import os
import re

import httpx

from app.services.corpus_quality import normalize_isbn


logger = logging.getLogger(__name__)
NARU_DETAIL_URL = "https://data4library.kr/api/srchDtlList"
_KDC_CODE = re.compile(r"^\d{3}(?:\.\d+)?$")


def _plain_text(value: str) -> str:
    return " ".join(re.sub(r"<[^>]*>", " ", html.unescape(value)).split())


async def _fetch_naru_detail(isbn: str, *, raise_on_error: bool = False) -> dict | None:
    """Return only an ISBN-matched library detail record."""
    api_key = os.getenv("LIBRARY_BIGDATA_API_KEY")
    if not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0)) as client:
            response = await client.get(NARU_DETAIL_URL, params={
                "authKey": api_key, "isbn13": isbn, "loaninfoYN": "N", "format": "json",
            })
            response.raise_for_status()
            detail = (response.json().get("response") or {}).get("detail") or []
    except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
        if raise_on_error:
            raise
        # This source is optional. Its failure leaves the candidate on HOLD.
        logger.warning("Naru metadata lookup failed isbn=%s error=%s", isbn, type(exc).__name__)
        return None
    if not isinstance(detail, list):
        return None
    for item in detail:
        if not isinstance(item, dict):
            continue
        book = item.get("book") or item
        if not isinstance(book, dict) or normalize_isbn(str(book.get("isbn13") or "")) != isbn:
            continue
        return book
    return None


async def fetch_naru_description(isbn: str) -> str | None:
    """Return a real book description only when the detail record confirms the ISBN."""
    book = await _fetch_naru_detail(isbn)
    description = book.get("description") if book else None
    if isinstance(description, str):
        plain = _plain_text(description)
        if len(plain) >= 30:
            return plain
    return None


async def fetch_naru_kdc(isbn: str, *, raise_on_error: bool = False) -> str | None:
    """Return an ISBN-verified KDC code; never infer it from title or author."""
    book = await _fetch_naru_detail(isbn, raise_on_error=raise_on_error)
    code = str(book.get("class_no") or "").strip() if book else ""
    return code if _KDC_CODE.fullmatch(code) else None
