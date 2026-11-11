"""Shared, source-independent gates for recommendation corpus admission."""

import re
from typing import Any

from app.services.reranker import _normalized_text
from app.services.text_utils import MULTI_BOOK_SET_TITLE, contains_exclusion_terms, format_authors


ELIGIBLE_BOOK_TYPES = {"STORY", "PRACTICAL", "NONFICTION"}


def normalize_isbn(value: str | None) -> str | None:
    tokens = re.findall(r"[0-9Xx-]{10,17}", value or "")
    for raw in sorted(tokens, key=lambda item: len(item.replace("-", "")), reverse=True):
        token = raw.replace("-", "").upper()
        if len(token) == 13 and token.startswith(("978", "979")) and token.isdigit() and sum(
            int(char) * (1 if index % 2 == 0 else 3) for index, char in enumerate(token)
        ) % 10 == 0:
            return token
        if len(token) == 10 and sum(
            (10 - index) * (10 if char == "X" else int(char)) for index, char in enumerate(token)
        ) % 11 == 0:
            stem = "978" + token[:9]
            check = (-sum(int(char) * (1 if index % 2 == 0 else 3) for index, char in enumerate(stem))) % 10
            return stem + str(check)
    return None


def preflight_candidate(book: dict[str, Any]) -> tuple[str, str] | None:
    """Return (status, reason) for a candidate that must not be classified."""
    raw_isbn = str(book.get("isbn") or "")
    if not normalize_isbn(raw_isbn):
        if re.search(r"(?<!\d)977\d{10}(?!\d)", raw_isbn):
            return "REJECTED", "PERIODICAL"
        return "REJECTED", "INVALID_ISBN"
    title = _normalized_text(str(book.get("title") or ""))
    authors = format_authors(book.get("authors"))
    contents = _normalized_text(str(book.get("contents") or ""))
    if not title or not authors:
        return "HOLD", "MISSING_IDENTITY"
    if MULTI_BOOK_SET_TITLE.search(title):
        return "REJECTED", "MULTI_BOOK_SET"
    if contains_exclusion_terms(title):
        return "REJECTED", "EDUCATIONAL_MATERIAL"
    if len(contents) < 30:
        return "HOLD", "SHORT_DESCRIPTION"
    return None


def validate_classification(book: dict[str, Any], result: dict[str, Any]) -> tuple[str, str | None, str | None, list[str]]:
    """Apply hard admission rules; the model's search term is never a label."""
    kind = result.get("book_type")
    if kind in {"EDUCATIONAL", "COLLECTION"}:
        return "REJECTED", kind, None, []
    if kind not in ELIGIBLE_BOOK_TYPES:
        return "HOLD", "UNKNOWN_BOOK_TYPE", None, []
    evidence = _normalized_text(str(result.get("evidence_quote") or ""))
    contents = _normalized_text(str(book.get("contents") or ""))
    if len(evidence) < 12 or evidence not in contents:
        return "HOLD", "UNVERIFIED_EVIDENCE", None, []
    keyword = _normalized_text(str(result.get("primary_keyword") or ""))[:60]
    if not keyword or keyword.casefold() in {"교육", "교재", "세트", "user_added"}:
        return "HOLD", "INVALID_CLASSIFICATION", None, []
    raw_tags = result.get("tags") if isinstance(result.get("tags"), list) else []
    tags = [
        _normalized_text(tag)[:60] for tag in raw_tags
        if isinstance(tag, str) and _normalized_text(tag)
    ]
    return "ACTIVE", None, keyword, list(dict.fromkeys([keyword, *tags]))[:12]
