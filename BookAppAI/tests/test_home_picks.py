import os

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app import database
from app.main import app
from app.routers import data_builder
from app.services.home_picks import home_picks


def book(kind, *tags):
    return {"title": "책", "authors": "작가"}, {"book_type": kind, "tags": list(tags)}


def test_known_interest_bridges_in_second_and_fourth_slots_without_repeating_own_books():
    books = {isbn: book("PRACTICAL", "탐조", "야외") for isbn in ("seed", "wish", "a", "b", "c")}
    books.update({isbn: book("NONFICTION", "탐조") for isbn in ("d", "e")})
    keywords = [{"tag": tag, "count": 1, "book_isbns": ["seed"]} for tag in ("탐조", "야외")]
    books["f"] = book("STORY", "음악")
    result = home_picks(books, keywords, {"seed", "wish"}, ["wish", "d"])
    assert result["basis"] == "DISCOVERY"
    assert [row["isbn13"] for row in result["books"]] == ["a", "d", "b", "e", "c"]


def test_catalog_only_seed_bridges_its_returned_books_on_the_same_interest():
    books = {"a": book("STORY", "새"), "b": book("UNKNOWN", "새"), "c": book("PRACTICAL", "새")}
    evidence = [{"tag": "새", "count": 1, "book_isbns": ["catalog-only"]}]
    result = home_picks(books, evidence, {"catalog-only"}, [])
    assert result["basis"] == "DISCOVERY"
    assert [row["isbn13"] for row in result["books"]] == ["a", "c", "b"]
    for item in books.values():
        item[1]["tags"] = ["청소년"]
    evidence[0]["tag"] = "청소년"
    assert home_picks(books, evidence, set(), [])["basis"] == "INTEREST"


def test_readers_only_or_empty_without_popularity_and_no_unreviewed_peer_metadata():
    books = {"a": book("PRACTICAL", "탐조"), "b": book("STORY", "가족"), "set": book("COLLECTION")}
    assert home_picks(books, [], {"a"}, ["a", "missing", "set"]) == {"basis": "EMPTY", "books": []}
    result = home_picks(books, [], {"a"}, ["b", "b"])
    assert result["basis"] == "READERS" and len(result["books"]) == 1
    assert home_picks(books, [{"tag": "탐조", "count": 1, "book_isbns": ["seed"]}],
                      {"seed"}, ["b"])["basis"] == "INTEREST_AND_READERS"


@pytest.mark.asyncio
async def test_home_route_uses_catalog_only_shelf_and_requires_matching_release(monkeypatch):
    url = os.getenv("REVIEWED_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a migrated disposable PostgreSQL database")
    engine = create_async_engine(url)
    seed = "9780008139384"  # 성남 소장자료의 경영 분류
    release = "a" * 64
    async def reviewed(db, selected):
        assert selected == release
        return {"9780306406157": book("NONFICTION", "경영")}

    async def session():
        async with AsyncSession(engine) as db:
            yield db

    monkeypatch.setattr(data_builder, "require_release", reviewed)
    monkeypatch.setenv("INTERNAL_API_TOKEN", "fixture")
    monkeypatch.setenv("GALPI_REVIEWED_RELEASE", release)
    monkeypatch.setitem(app.dependency_overrides, database.get_db, session)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            body = {"reading": [seed], "owned": [seed], "peers": []}
            headers = {"X-Internal-Token": "fixture", "X-Reviewed-Release": release}
            response = await client.post("/api/user/home-picks", json=body, headers=headers)
            assert response.status_code == 200 and response.json()["basis"] == "INTEREST"
            assert response.json()["books"][0]["isbn13"] == "9780306406157"
            headers["X-Reviewed-Release"] = "b" * 64
            assert (await client.post("/api/user/home-picks", json=body, headers=headers)).status_code == 503
            assert (await client.post("/api/user/home-picks", json=body)).status_code == 403
    finally:
        await engine.dispose()
