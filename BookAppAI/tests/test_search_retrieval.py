import pytest

from app.services.intent_classifier import IntentMetadata
from app.services.search_retrieval import _author_matches, _merge_and_score, retrieve_candidates


def _row(isbn: str, similarity: float, authors: str = "작가", keyword: str = "소설") -> dict:
    return {
        "isbn": isbn, "similarity": similarity, "authors": authors,
        "keyword": keyword, "tags": [keyword], "title": isbn,
    }


def test_two_lanes_merge_by_isbn_and_sort_deterministically():
    rows = _merge_and_score(
        [[_row("b", 0.6), _row("a", 0.6)], [_row("b", 0.6), _row("weak", 0.2)]],
        ["소설"],
    )
    assert [row["isbn"] for row in rows] == ["a", "b"]


def test_author_match_uses_whole_author_name():
    assert _author_matches("김영하, 한강", "김영하")
    assert _author_matches("무라카미 하루키 (지은이)", "무라카미 하루키")
    assert not _author_matches("이상엽", "이상")


@pytest.mark.asyncio
async def test_exact_author_uses_only_matching_author_lane():
    class FakeResult:
        def __init__(self, rows):
            self.rows = rows

        def mappings(self):
            return self.rows

    class FakeDB:
        async def execute(self, statement, params):
            sql = str(statement)
            if "ILIKE" in sql:
                return FakeResult([_row("author-book", 0.3, "김영하"), _row("other", 0.9, "다른 작가")])
            if "keyword = ANY" in sql:
                return FakeResult([_row("keyword-book", 0.9, "다른 작가")])
            return FakeResult([_row("vector-book", 0.9, "다른 작가")])

    intent = IntentMetadata(raw_query="김영하 작가의 책", query_type="author", focus_author="김영하")
    candidates, counts = await retrieve_candidates(FakeDB(), [0.1], intent, ["소설"])

    assert [book["isbn"] for book in candidates] == ["author-book"]
    assert counts.author == 1
    assert counts.vector == 0
    assert counts.keyword == 0


@pytest.mark.asyncio
async def test_explicit_genre_title_rescues_low_similarity_book():
    class FakeResult:
        def __init__(self, rows):
            self.rows = rows

        def mappings(self):
            return self.rows

    class FakeDB:
        async def execute(self, statement, params):
            if "title ILIKE" in str(statement):
                assert params["title_0"] == "%로맨스%"
                return FakeResult([_row("real-romance", 0.27, keyword="판타지")])
            return FakeResult([])

    intent = IntentMetadata(raw_query="로맨스 소설 추천", genre="로맨스")
    candidates, counts = await retrieve_candidates(FakeDB(), [0.1], intent, ["로맨스"])

    assert [book["isbn"] for book in candidates] == ["real-romance"]
    assert candidates[0]["retrieval_score"] >= 0.55
    assert counts.title == 1


@pytest.mark.asyncio
async def test_reviewed_exact_genre_is_retrieved_beyond_crowded_keyword_lane():
    class FakeResult:
        def __init__(self, rows):
            self.rows = rows

        def mappings(self):
            return self.rows

    reviewed = {
        **_row("reviewed-sf", 0.49, keyword="SF"),
        "source": "CURATED_SEED", "classification_version": "model:reviewed",
        "recommendation_status": "ACTIVE",
    }

    class FakeDB:
        async def execute(self, statement, params):
            sql = str(statement)
            if "classification_version LIKE" in sql:
                assert params["genre"] == "sf"
                assert params["review_suffix"] == "%:reviewed"
                assert params["limit"] == 5
                return FakeResult([reviewed])
            if "title ILIKE" in sql:
                return FakeResult([])
            return FakeResult([_row(f"legacy-{n}", 0.7, keyword="SF") for n in range(20)])

    intent = IntentMetadata(raw_query="SF 소설 추천", genre="SF", requested_form="STORY")
    candidates, counts = await retrieve_candidates(FakeDB(), [0.1], intent, ["SF"])

    assert "reviewed-sf" in {book["isbn"] for book in candidates}
    assert counts.reviewed_genre == 1
