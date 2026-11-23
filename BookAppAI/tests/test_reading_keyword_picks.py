import pytest
from pydantic import ValidationError

from app.schemas import ReadingKeywordPicksRequest
from app.services.reading_keyword_picks import library_keywords, public_picks


def test_library_uses_only_selected_editions_and_deduplicates_evidence():
    books = {
        "a": ({"title": "봄", "authors": "작가"}, {"tags": [" 성장 ", "성장", "user_added"]}),
        "b": ({"title": "별", "authors": "작가"}, {"tags": ["성장", "우주"]}),
        "c": ({"title": "숲", "authors": "작가"}, {"tags": ["자연"]}),
    }
    assert library_keywords({isbn: entry[1]["tags"] for isbn, entry in books.items()}, ["a", "a", "b", "unknown"], 1) == {
        "analyzed": 2, "keywords": [{"tag": "성장", "count": 2, "book_isbns": ["a", "b"]}]}
    picks = public_picks(books, ["성장", "우주"])
    assert [r["isbn13"] for r in picks] == ["b", "a"]
    assert picks[0] == {"isbn13": "b", "title": "별", "authors": "작가", "thumbnail": None}


@pytest.mark.parametrize("tags", [[], ["a", "b", "c", "d"], [" "], ["가족\x00"]])
def test_public_pick_input_is_bounded(tags):
    with pytest.raises(ValidationError):
        ReadingKeywordPicksRequest(keywords=tags)


def test_korean_labels_merge_before_counting_and_public_lookup():
    books = {"a": ({"title": "봄", "authors": "저자"}, {"tags": ["mystery", "미스터리", "ＳＦ", "unknown"]}),
             "b": ({"title": "별", "authors": "저자"}, {"tags": ["SF소설", "과학소설", "user_added"]})}
    result = library_keywords({isbn: entry[1]["tags"] for isbn, entry in books.items()}, ["a", "b"], 10)
    assert [(r["tag"], r["count"]) for r in result["keywords"]] == [("과학소설", 2), ("미스터리", 1)]
    assert public_picks(books, ["과학소설"]) == public_picks(books, ["SF"])
