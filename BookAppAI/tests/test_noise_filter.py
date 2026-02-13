import pytest

from app.services.text_utils import contains_exclusion_terms, should_skip_book


@pytest.mark.parametrize(
    "title,contents,expected",
    [
        ("2026 수능 국어 기출", "수능 대비 기출 문제 수록", True),
        ("자이스토리 수학", "내신 대비 문제집", True),
        ("해리포터와 마법사의 돌", "호그와트에서의 모험", False),
        ("불편한 편의점", "따뜻한 소설", False),
    ],
)
def test_contains_exclusion_terms(title, contents, expected):
    assert contains_exclusion_terms(title, contents) is expected


def test_should_skip_book_skips_when_contents_empty_and_authors_missing():
    # Kakao API에서 제목만 있고 다른 정보가 비어있는 노이즈 케이스 방어
    book = {"title": "어떤 제목", "contents": "", "authors": "", "isbn": "123 9781234567890"}
    assert should_skip_book("소설", book) is True


def test_should_skip_book_allows_normal_book():
    book = {
        "title": "어린 왕자",
        "contents": "사막에서 만난 어린 왕자 이야기",
        "authors": ["생텍쥐페리"],
        "isbn": "123 9781234567890",
    }
    assert should_skip_book("소설", book) is False


