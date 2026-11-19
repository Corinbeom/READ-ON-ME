from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.corpus_quality import normalize_isbn
from app.services.text_utils import MULTI_BOOK_SET_TITLE, contains_exclusion_terms


async def find_reading_keyword_isbns(db: AsyncSession, keywords: list[str]) -> list[str]:
    selected = sorted({keyword.strip().lower() for keyword in keywords} - {"", "user_added"})
    if not selected:
        return []

    result = await db.execute(text("""
        SELECT book.isbn, book.title
        FROM book_corpus AS book
        CROSS JOIN LATERAL (
            SELECT count(DISTINCT lower(btrim(tag.value))) AS matched_count
            FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(book.tags) = 'array' THEN book.tags ELSE '[]'::jsonb END
            ) AS tag(value)
            WHERE lower(btrim(tag.value)) = ANY(:keywords)
        ) AS matches
        WHERE book.recommendation_status IN ('ACTIVE', 'LEGACY')
          AND matches.matched_count > 0
        ORDER BY (book.recommendation_status = 'ACTIVE') DESC, matches.matched_count DESC,
                 (book.source = 'CURATED_SEED') DESC NULLS LAST,
                 (lower(book.keyword) <> 'user_added') DESC, book.isbn
        LIMIT 36
    """), {"keywords": selected})

    picks = []
    seen = set()
    for book in result.mappings():
        isbn = normalize_isbn(book["isbn"])
        title = book["title"].strip()
        if not isbn or isbn in seen or not title:
            continue
        if contains_exclusion_terms(title) or MULTI_BOOK_SET_TITLE.search(title):
            continue
        seen.add(isbn)
        picks.append(isbn)
    return picks
