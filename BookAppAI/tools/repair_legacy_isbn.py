"""Preview or repair selected legacy ISBNs using the same Kakao book record."""

import argparse
import asyncio
import json
import os
from pathlib import Path

import httpx
from sqlalchemy import select

from app import database
from app.models.book_corpus import BookCorpus
from app.services.corpus_quality import normalize_isbn
from app.services.text_utils import format_authors


KAKAO_URL = "https://dapi.kakao.com/v3/search/book"


def _clean(value: str | None) -> str:
    return " ".join(str(value or "").split()).casefold()


def _snapshot(book: BookCorpus) -> dict:
    return {field: getattr(book, field) for field in ("isbn", "title", "authors", "publisher", "thumbnail")}


def _matches_snapshot(book: BookCorpus, original: dict) -> bool:
    return book.recommendation_status == "LEGACY" and all(
        getattr(book, field) == value for field, value in original.items()
    )


def resolve_isbn(book: BookCorpus, documents: list[dict]) -> str | None:
    """Accept only one valid ISBN from an exact match to the old Kakao record."""
    matches = set()
    for document in documents:
        raw = document.get("isbn") or ""
        if book.isbn not in raw.split():
            continue
        replacement = normalize_isbn(raw)
        if not replacement or replacement == book.isbn:
            continue
        if not all((
            _clean(document.get("title")) == _clean(book.title),
            _clean(format_authors(document.get("authors"))) == _clean(book.authors),
            _clean(document.get("publisher")) == _clean(book.publisher),
            bool(book.thumbnail) and document.get("thumbnail") == book.thumbnail,
        )):
            continue
        matches.add(replacement)
    return next(iter(matches)) if len(matches) == 1 else None


async def run(ids: list[int], apply: bool, output: Path) -> None:
    if not os.getenv("KAKAO_API_KEY"):
        raise RuntimeError("KAKAO_API_KEY is required")
    database.init_db()
    try:
        async with database.async_session() as db:
            books = (await db.execute(select(BookCorpus).where(BookCorpus.id.in_(ids)))).scalars().all()
            if len(books) != len(ids):
                raise ValueError("Every selected corpus ID must exist")
            if any(book.recommendation_status != "LEGACY" or normalize_isbn(book.isbn) for book in books):
                raise ValueError("Selected rows must be LEGACY books with invalid ISBNs")
            originals = {book.id: _snapshot(book) for book in books}

        proposals = []
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=3.0)) as client:
            for book in books:
                try:
                    response = await client.get(
                        KAKAO_URL,
                        headers={"Authorization": f"KakaoAK {os.environ['KAKAO_API_KEY']}"},
                        params={"query": book.isbn, "target": "isbn", "size": 10},
                    )
                    response.raise_for_status()
                    replacement = resolve_isbn(book, response.json().get("documents") or [])
                    status = "MATCH" if replacement else "NO_EXACT_MATCH"
                except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
                    replacement = None
                    status = type(exc).__name__
                proposals.append({"id": book.id, "old_isbn": book.isbn,
                                  "new_isbn": replacement, "status": status})

        targets = [row["new_isbn"] for row in proposals if row["new_isbn"]]
        async with database.async_session() as db:
            occupied = set((await db.execute(select(BookCorpus.isbn).where(BookCorpus.isbn.in_(targets)))).scalars().all())
        for row in proposals:
            if row["new_isbn"] in occupied:
                row["status"] = "TARGET_EXISTS"
            elif row["new_isbn"] and targets.count(row["new_isbn"]) > 1:
                row["status"] = "DUPLICATE_TARGET"
        output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in proposals))
        print(f"matched={sum(row['status'] == 'MATCH' for row in proposals)} selected={len(ids)} output={output}")
        if not apply:
            return
        if any(row["status"] != "MATCH" for row in proposals):
            raise ValueError("No rows were changed: every selected ISBN needs one exact, unused replacement")

        replacements = {row["id"]: row["new_isbn"] for row in proposals}
        async with database.async_session() as db:
            async with db.begin():
                locked = (await db.execute(select(BookCorpus).where(BookCorpus.id.in_(ids)).with_for_update())).scalars().all()
                if len(locked) != len(ids):
                    raise ValueError("Selected rows changed during verification")
                for book in locked:
                    if not _matches_snapshot(book, originals[book.id]):
                        raise ValueError("Selected rows changed during verification")
                collisions = (await db.execute(select(BookCorpus.isbn).where(BookCorpus.isbn.in_(targets)))).scalars().all()
                if collisions:
                    raise ValueError("A replacement ISBN already exists")
                for book in locked:
                    book.isbn = replacements[book.id]
        print(f"repaired={len(ids)}")
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ids", required=True, help="Comma-separated local book_corpus IDs")
    parser.add_argument("--apply", action="store_true", help="Update the selected rows; default is preview")
    parser.add_argument("--output", type=Path, default=Path("/tmp/readonme-isbn-repair.jsonl"))
    args = parser.parse_args()
    try:
        selected = [int(part.strip()) for part in args.ids.split(",")]
    except ValueError:
        parser.error("--ids requires comma-separated integers")
    if not selected or len(selected) > 20 or len(selected) != len(set(selected)) or any(value < 1 for value in selected):
        parser.error("--ids requires 1–20 distinct positive IDs")
    asyncio.run(run(selected, args.apply, args.output))
