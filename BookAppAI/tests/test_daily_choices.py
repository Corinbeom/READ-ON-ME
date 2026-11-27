from datetime import date, timedelta

import httpx
import pytest

from app.main import app
from app.services.daily_choices import daily_choices

DAY = date(2026, 11, 27)


def edition(title, kind, topic):
    return ({"title": title, "authors": f"{title} 작가", "contents": f"{title} 소개"},
            {"book_type": kind, "primary_keyword": topic, "tags": [topic]})


def test_daily_choices_rotate_complete_pools_without_changing_on_refresh():
    books = {f"{kind}-{i}": edition(f"{topic} {i}", kind, topic)
             for kind, topic in [("STORY", "우정"), ("NONFICTION", "지리"), ("PRACTICAL", "요리")]
             for i in range(5)}
    choices = daily_choices(books, DAY)
    assert choices == daily_choices(dict(reversed(books.items())), DAY)
    seen = set()
    for offset in range(5):
        rows = daily_choices(books, DAY + timedelta(days=offset))
        assert [row["topic"] for row in rows] == ["우정", "지리", "요리"]
        for row in rows:
            isbn = row["isbn"]
            assert isbn not in seen and row["topic"] in row["prompt"]
            assert row["contents"] == books[isbn][0]["contents"]
            seen.add(isbn)
    assert seen == books.keys()


def test_question_prefers_a_concrete_subject_from_the_edition_title():
    fields, classification = edition("꽃을 공부합니다", "NONFICTION", "자연과학")
    classification["tags"] = ["자연과학", "생태", "꽃"]
    choice, = daily_choices({"a": (fields, classification)}, DAY)
    assert choice["topic"] == "꽃" and "꽃에 대해" in choice["prompt"]


def test_sparse_catalog_fills_with_distinct_eligible_titles_and_uses_korean_topics():
    books = {"a": edition("첫 책", "STORY", "mystery"), "b": edition("첫 책", "NONFICTION", "역사"),
             "c": edition("다른 책", "STORY", "우정"), "d": edition("셋째 책", "STORY", "기억"),
             "e": edition("문제집", "PRACTICAL", "학습"), "f": edition("시리즈", "COLLECTION", "역사"),
             "g": edition("자료", "NONFICTION", "user_added")}
    rows = daily_choices(books, DAY)
    assert {row["title"] for row in rows} == {"첫 책", "다른 책", "셋째 책"}
    assert "미스터리" in {row["topic"] for row in daily_choices({"a": books["a"]}, DAY)}
    assert daily_choices({}, DAY) == []


@pytest.mark.asyncio
async def test_daily_route_blocks_unreviewed_releases_and_requires_internal_credentials(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_TOKEN", "fixture")
    monkeypatch.setenv("GALPI_REVIEWED_RELEASE", "a" * 64)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        path = "/api/books/daily-choices"
        assert (await client.get(path)).status_code == 403
        headers = {"X-Internal-Token": "fixture"}
        assert (await client.get(path, headers=headers)).json() == []
        headers["X-Reviewed-Release"] = "b" * 64
        assert (await client.get(path, headers=headers)).status_code == 503
