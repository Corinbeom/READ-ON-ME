from types import SimpleNamespace

import pytest

from app.services.reference_search import (
    ReferenceAnchor, find_reference_anchor, has_theme_evidence, is_verified_similar_fallback,
)


class FakeResult:
    def __init__(self, books):
        self.books = books

    def scalars(self):
        return self

    def all(self):
        return self.books


class FakeDB:
    def __init__(self, books):
        self.books = books

    async def execute(self, statement):
        return FakeResult(self.books)


@pytest.mark.asyncio
async def test_reference_anchor_uses_books_by_exact_author():
    books = [
        SimpleNamespace(isbn="1", title="1984", authors="조지 오웰", contents="긴 설명", embedding=[1.0, 0.0], keyword="디스토피아", tags=["디스토피아", "전체주의"]),
        SimpleNamespace(isbn="4", title="1984 (새 판본)", authors="조지 오웰", contents="다른 설명", embedding=[1.0, 0.0], keyword="디스토피아", tags=["디스토피아"]),
        SimpleNamespace(isbn="2", title="동물 농장", authors="조지 오웰", contents="설명", embedding=[0.0, 1.0], keyword="정치", tags=["우화", "전체주의"]),
        SimpleNamespace(isbn="3", title="다른 책", authors="조지 오웰 주니어", contents="긴 설명", embedding=[1.0, 1.0], keyword="소설", tags=[]),
        SimpleNamespace(isbn="5", title="문학 세트", authors="조지 오웰, 다른 작가", contents="합본 설명", embedding=[1.0, 1.0], keyword="소설", tags=[]),
    ]
    anchor = await find_reference_anchor(FakeDB(books), "조지 오웰")
    assert anchor is not None
    assert anchor.author == "조지 오웰"
    assert anchor.titles == ["1984", "동물 농장"]
    assert anchor.embedding == pytest.approx([2 ** -0.5, 2 ** -0.5])
    assert "전체주의" in anchor.theme_keywords


@pytest.mark.asyncio
async def test_missing_reference_does_not_make_generic_anchor():
    books = [SimpleNamespace(isbn="3", title="다른 책", authors="다른 작가", contents="설명", embedding=[1.0, 1.0], keyword="소설", tags=[])]
    assert await find_reference_anchor(FakeDB(books), "조지 오웰") is None


def test_theme_evidence_accepts_tag_or_description():
    assert has_theme_evidence({"keyword": "디스토피아", "tags": []}, ["디스토피아"])
    assert has_theme_evidence({"contents": "전체주의 사회를 그린 소설입니다."}, ["전체주의"])
    assert not has_theme_evidence({"title": "일반 역사책", "tags": ["역사"]}, ["디스토피아"])


def test_similar_author_fallback_requires_shared_themes_and_a_work():
    reference = ReferenceAnchor("김영하", ["기준 소설"], [1.0], ["기억", "상실", "가족"])
    novel = {
        "title": "다른 작가의 장편소설", "authors": "다른 작가",
        "contents": "기억과 상실을 겪는 가족의 이야기를 그린 장편소설입니다.",
        "keyword": "소설", "tags": ["기억", "상실"],
    }
    assert is_verified_similar_fallback(novel, reference)
    assert not is_verified_similar_fallback({**novel, "authors": "김영하"}, reference)
    assert not is_verified_similar_fallback({**novel, "tags": ["기억"], "contents": "기억을 다룬 장편소설입니다."}, reference)
    assert not is_verified_similar_fallback({**novel, "title": "기억 활용법"}, reference)
    assert not is_verified_similar_fallback({**novel, "title": "기억의 분석", "contents": "기억과 상실을 분석하는 비평서입니다."}, reference)
