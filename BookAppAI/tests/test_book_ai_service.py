import pytest

from app.services.book_ai_service import (
    build_book_text,
    build_keyword_prompt,
    contains_exclusion_terms,
    should_skip_book,
)


def test_contains_exclusion_terms_strict_keyword():
    assert contains_exclusion_terms("이 책은 수능 대비 필독서입니다.")


def test_contains_exclusion_terms_combo_keyword():
    assert contains_exclusion_terms("중학 국어 독해 문제집")


def test_contains_exclusion_terms_non_educational():
    assert not contains_exclusion_terms("문학적 상상력과 감성을 자극하는 작품")


def test_build_keyword_prompt_uses_custom_mapping():
    prompt = build_keyword_prompt("SF")
    assert "공상 과학" in prompt


def test_build_keyword_prompt_default_template():
    prompt = build_keyword_prompt("자기계발")
    assert "자기계발" in prompt


def test_build_book_text_with_authors():
    text = build_book_text("제목", "내용", ["홍길동", "임꺽정"])
    assert "홍길동" in text and "임꺽정" in text


def test_build_book_text_without_authors():
    text = build_book_text("제목", "내용", [])
    assert "다양한 작가" in text


def test_should_skip_book_by_exclusion_terms():
    book = {
        "title": "중학 국어 독해",
        "contents": "모의고사 대비",
        "authors": ["저자"],
    }
    assert should_skip_book("keyword", book)


def test_should_skip_book_without_metadata():
    book = {"title": "이상한 책", "contents": "", "authors": []}
    assert should_skip_book("keyword", book)


def test_should_not_skip_regular_book():
    book = {
        "title": "소설책",
        "contents": "사람과 사람의 관계를 그린 이야기",
        "authors": ["작가"],
    }
    assert not should_skip_book("keyword", book)
