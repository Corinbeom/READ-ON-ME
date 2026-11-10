from dataclasses import dataclass
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.intent_classifier import IntentMetadata


VECTOR_LIMIT = 30
KEYWORD_LIMIT = 20
AUTHOR_LIMIT = 50
TITLE_LIMIT = 20
MIN_SIMILARITY = 0.4
TITLE_GENRE_TERMS = {
    "sf": ("SF", "공상과학"),
    "판타지": ("판타지",),
    "로맨스": ("로맨스", "연애소설"),
    "스릴러": ("스릴러",),
    "미스터리": ("미스터리", "추리"),
    "디스토피아": ("디스토피아",),
}

_COLUMNS = "id, title, contents, isbn, authors, publisher, thumbnail, keyword, tags"


@dataclass
class RetrievalCounts:
    vector: int = 0
    keyword: int = 0
    author: int = 0
    title: int = 0
    merged: int = 0


def _author_matches(authors: str | None, author: str) -> bool:
    normalized_author = "".join(author.casefold().split())
    if not normalized_author:
        return False
    for name in re.split(r"[,;/]", authors or ""):
        name = re.sub(r"\([^)]*\)|\[[^]]*\]", "", name)
        if "".join(name.casefold().split()) == normalized_author:
            return True
    return False


def _merge_and_score(
    lanes: list[list[dict[str, Any]]], keywords: list[str], minimum_similarity: float = MIN_SIMILARITY,
) -> list[dict[str, Any]]:
    by_isbn: dict[str, dict[str, Any]] = {}
    keyword_set = {keyword.casefold() for keyword in keywords}
    for lane in lanes:
        for row in lane:
            isbn = row.get("isbn")
            if not isbn or (row.get("similarity") or 0) < minimum_similarity:
                continue
            tags = row.get("tags") if isinstance(row.get("tags"), list) else []
            keyword_match = str(row.get("keyword") or "").casefold() in keyword_set
            tag_match = any(str(tag).casefold() in keyword_set for tag in tags)
            candidate = dict(row)
            candidate["retrieval_score"] = float(row["similarity"]) + (0.08 if keyword_match else 0) + (0.04 if tag_match else 0)
            previous = by_isbn.get(isbn)
            if previous is None or candidate["retrieval_score"] > previous["retrieval_score"]:
                by_isbn[isbn] = candidate
    return sorted(by_isbn.values(), key=lambda row: (-row["retrieval_score"], row["isbn"]))


async def retrieve_candidates(
    db: AsyncSession,
    embedding: list[float],
    intent: IntentMetadata,
    keywords: list[str],
    exclude_author: str | None = None,
) -> tuple[list[dict[str, Any]], RetrievalCounts]:
    embedding_value = str(list(embedding))
    counts = RetrievalCounts()
    direct_author = intent.query_type == "author" and bool(intent.focus_author)
    exclusion = "COALESCE(REPLACE(authors, ' ', ''), '') NOT ILIKE :excluded_author"
    excluded_pattern = None
    if exclude_author:
        compact = exclude_author.replace(" ", "").replace("%", "\\%").replace("_", "\\_")
        excluded_pattern = f"%{compact}%"
    vector_rows: list[dict[str, Any]] = []
    keyword_rows: list[dict[str, Any]] = []
    title_rows: list[dict[str, Any]] = []
    if not direct_author:
        vector_sql = text(f"""
            SELECT {_COLUMNS}, 1 - (embedding <=> :embedding) AS similarity
            FROM book_corpus
            {f'WHERE {exclusion}' if excluded_pattern else ''}
            ORDER BY embedding <=> :embedding
            LIMIT :limit
        """)
        vector_params = {"embedding": embedding_value, "limit": VECTOR_LIMIT}
        if excluded_pattern:
            vector_params["excluded_author"] = excluded_pattern
        vector_rows = [dict(row) for row in (await db.execute(
            vector_sql, vector_params,
        )).mappings()]
        counts.vector = len(vector_rows)

        if keywords:
            keyword_sql = text(f"""
                SELECT {_COLUMNS}, 1 - (embedding <=> :embedding) AS similarity
                FROM book_corpus
                WHERE (keyword = ANY(:keywords)
                   OR EXISTS (
                       SELECT 1 FROM jsonb_array_elements_text(tags) AS tag(value)
                       WHERE tag.value = ANY(:keywords)
                   ))
                   {f'AND {exclusion}' if excluded_pattern else ''}
                ORDER BY similarity DESC
                LIMIT :limit
            """)
            keyword_params = {"embedding": embedding_value, "keywords": keywords, "limit": KEYWORD_LIMIT}
            if excluded_pattern:
                keyword_params["excluded_author"] = excluded_pattern
            keyword_rows = [dict(row) for row in (await db.execute(
                keyword_sql, keyword_params,
            )).mappings()]
        title_terms = TITLE_GENRE_TERMS.get((intent.genre or "").casefold())
        if title_terms:
            title_condition = " OR ".join(f"title ILIKE :title_{index}" for index in range(len(title_terms)))
            title_sql = text(f"""
                SELECT {_COLUMNS}, 1 - (embedding <=> :embedding) AS similarity
                FROM book_corpus
                WHERE ({title_condition})
                  {f'AND {exclusion}' if excluded_pattern else ''}
                ORDER BY similarity DESC
                LIMIT :limit
            """)
            title_params = {
                "embedding": embedding_value, "limit": TITLE_LIMIT,
                **{f"title_{index}": f"%{term}%" for index, term in enumerate(title_terms)},
            }
            if excluded_pattern:
                title_params["excluded_author"] = excluded_pattern
            title_rows = [dict(row) for row in (await db.execute(title_sql, title_params)).mappings()]
            counts.title = len(title_rows)
    counts.keyword = len(keyword_rows)

    author_rows: list[dict[str, Any]] = []
    if direct_author:
        pattern = intent.focus_author.replace(" ", "").replace("%", "\\%").replace("_", "\\_")
        author_sql = text(f"""
            SELECT {_COLUMNS}, 1 - (embedding <=> :embedding) AS similarity
            FROM book_corpus
            WHERE REPLACE(authors, ' ', '') ILIKE :pattern ESCAPE '\\'
            ORDER BY similarity DESC
            LIMIT :limit
        """)
        author_rows = [dict(row) for row in (await db.execute(
            author_sql,
            {"embedding": embedding_value, "pattern": f"%{pattern}%", "limit": AUTHOR_LIMIT},
        )).mappings()]
        author_rows = [row for row in author_rows if _author_matches(row.get("authors"), intent.focus_author)]
    counts.author = len(author_rows)

    lanes = [author_rows] if direct_author else [vector_rows, keyword_rows]
    merged = _merge_and_score(lanes, keywords, 0.0 if direct_author else MIN_SIMILARITY)
    if title_rows:
        by_isbn = {book["isbn"]: book for book in merged}
        for book in _merge_and_score([title_rows], keywords, 0.2):
            # An explicit genre in the title can rescue a relevant book whose
            # generic sentence embedding scores below the semantic cutoff.
            book["retrieval_score"] = max(book["retrieval_score"], 0.55)
            previous = by_isbn.get(book["isbn"])
            if previous is None or book["retrieval_score"] > previous["retrieval_score"]:
                by_isbn[book["isbn"]] = book
        merged = sorted(by_isbn.values(), key=lambda row: (-row["retrieval_score"], row["isbn"]))
    counts.merged = len(merged)
    return merged, counts
