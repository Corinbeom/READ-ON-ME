"""Build a local search anchor from books by a named reference author."""

from collections import Counter
from dataclasses import dataclass, field
import re

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book_corpus import BookCorpus
from app.services.search_retrieval import _author_matches
from app.services.text_utils import FICTION_LABELS, has_fiction_evidence, infer_book_form


@dataclass
class ReferenceAnchor:
    author: str
    titles: list[str]
    embedding: list[float]
    theme_keywords: list[str] = field(default_factory=list)


_GENERIC_TAGS = {
    "소설", "문학", "고전", "고전 소설", "번역", "영미문학", "영국 문학", "classic", "english",
    "필독서", "전문", "정치", "에세이", "인문학", "sf", "사색적", "thought-provoking", "british literature",
}


def _work_title(title: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", title).strip().casefold()


def _themes(books: list[BookCorpus]) -> list[str]:
    counts: Counter[str] = Counter()
    for book in books:
        labels = [book.keyword, *(book.tags if isinstance(book.tags, list) else [])]
        counts.update(
            tag for tag in dict.fromkeys(tag for tag in labels if isinstance(tag, str))
            if tag.strip() and tag.casefold() not in _GENERIC_TAGS
        )
    return [tag for tag, _ in counts.most_common(8)]


def has_theme_evidence(book: dict, themes: list[str]) -> bool:
    labels = [book.get("keyword"), *(book.get("tags") if isinstance(book.get("tags"), list) else [])]
    labels = {label.casefold() for label in labels if isinstance(label, str)}
    description = f"{book.get('title') or ''} {book.get('contents') or ''}".casefold()
    return any(theme.casefold() in labels or (len(theme) >= 3 and theme.casefold() in description) for theme in themes)


def is_verified_similar_fallback(book: dict, reference: ReferenceAnchor) -> bool:
    """Require two shared themes and work evidence before bypassing the reranker."""
    if _author_matches(book.get("authors"), reference.author):
        return False
    if infer_book_form(book.get("title") or "", book.get("contents") or "") == "PRACTICAL":
        return False
    tags = book.get("tags") if isinstance(book.get("tags"), list) else []
    labels = {
        label.casefold() for label in [book.get("keyword"), *tags]
        if isinstance(label, str)
    }
    description = f"{book.get('title') or ''} {book.get('contents') or ''}".casefold()
    shared = {
        theme.casefold() for theme in reference.theme_keywords
        if theme and (
            theme.casefold() in labels or (len(theme) >= 3 and theme.casefold() in description)
        )
    }
    if len(shared) < 2:
        return False
    intro = (book.get("contents") or "")[:500].casefold()
    work_evidence = has_fiction_evidence(book) or (
        bool(labels & {label.casefold() for label in FICTION_LABELS})
        and "작품" in intro and "그린" in intro
    )
    return work_evidence


def _author_variants(name: str) -> list[str]:
    tokens = name.strip().split()
    return [" ".join(tokens[index:]) for index in range(len(tokens)) if tokens[index:]]


async def find_reference_anchor(db: AsyncSession, author: str) -> ReferenceAnchor | None:
    for variant in _author_variants(author):
        compact = variant.replace(" ", "").replace("%", "\\%").replace("_", "\\_")
        statement = (
            select(BookCorpus)
            .where(func.replace(BookCorpus.authors, " ", "").ilike(f"%{compact}%", escape="\\"))
            .where(BookCorpus.recommendation_status.in_(["ACTIVE", "LEGACY"]))
            .order_by(BookCorpus.created_at.desc(), BookCorpus.isbn)
            .limit(50)
        )
        rows = (await db.execute(statement)).scalars().all()
        books = [
            book for book in rows
            if _author_matches(book.authors, variant) and len((book.authors or "").split(",")) == 1
            and not any(term in (book.title or "") for term in ("세트", "전집", "모음"))
        ]
        books.sort(key=lambda book: (
            -(len(book.tags) if isinstance(book.tags, list) else 0),
            -(len(book.contents or "")), book.isbn,
        ))
        distinct: dict[str, BookCorpus] = {}
        for book in books:
            distinct.setdefault(_work_title(book.title), book)
        books = list(distinct.values())
        fiction = [book for book in books if (book.keyword or "").casefold() not in {"에세이", "논픽션", "인문학"}]
        if fiction:
            books = fiction
        vectors: list[np.ndarray] = []
        titles: list[str] = []
        selected: list[BookCorpus] = []
        for book in books:
            vector = np.asarray(book.embedding, dtype=float)
            norm = np.linalg.norm(vector)
            if vector.ndim != 1 or not np.isfinite(norm) or norm == 0:
                continue
            vectors.append(vector / norm)
            titles.append(book.title)
            selected.append(book)
            if len(vectors) >= 5:
                break
        if vectors:
            centroid = np.mean(vectors, axis=0)
            norm = np.linalg.norm(centroid)
            if norm > 0:
                return ReferenceAnchor(variant, titles, (centroid / norm).tolist(), _themes(selected))
    return None
