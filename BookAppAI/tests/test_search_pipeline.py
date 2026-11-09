import httpx
import pytest

from app.services import llm_cooldown, query_rewriter, reranker
from app.services.intent_classifier import IntentMetadata
from app.services.reranker import _parse_selection
from app.services.text_utils import is_search_candidate


def _book(title: str, contents: str, keyword: str, tags: list[str]) -> dict:
    return {
        "title": title,
        "contents": contents,
        "authors": "홍길동",
        "keyword": keyword,
        "tags": tags,
    }


def test_novel_candidates_reject_exam_books_and_other_genres():
    novel = _book(
        "세계를 건너 너에게 갈게",
        "시공간을 건너 이어지는 편지와 따뜻한 결말을 담은 이야기입니다.",
        "user_added", ["힐링", "문학"],
    )
    exam = _book(
        "전공국어 현대소설",
        "교원임용시험을 준비하는 사람을 위한 이론과 연습문제를 담았습니다.",
        "소설", ["소설", "대비"],
    )
    career = _book(
        "진로탐색 및 취업과 창업",
        "취업 준비생을 위한 학습 내용과 최근 경향을 정리한 도서입니다.",
        "비즈니스", ["비즈니스", "창업"],
    )
    unclassified_essay = _book(
        "마음을 돌보는 글",
        "우울했던 날과 그 시간을 지나온 경험을 기록한 에세이입니다.",
        "user_added", ["user_added"],
    )
    copying_book = _book(
        "쓰면서 배우는 인생 필사: 고전 소설 100",
        "고전 작품의 구절을 따라 쓰며 문장을 익히는 필사 책입니다.",
        "소설", ["소설", "문학"],
    )

    assert is_search_candidate(novel, "소설")
    assert not is_search_candidate(exam, "소설")
    assert not is_search_candidate(career, "소설")
    assert not is_search_candidate(unclassified_essay, "소설")
    assert not is_search_candidate(copying_book, "소설")


def test_reranker_selection_ignores_duplicate_and_invalid_book_numbers():
    books = [
        {"isbn": "1", "title": "첫 번째"},
        {"isbn": "2", "title": "두 번째"},
        {"isbn": "2", "title": "두 번째 다른 판본"},
    ]

    selected = _parse_selection("2|적합한 책\n2|중복\n99|없는 책\n3|같은 ISBN\n1|다른 책", books)

    assert [(book["isbn"], book["reason"]) for book in selected] == [
        ("2", "적합한 책"),
        ("1", "다른 책"),
    ]


def test_self_help_candidates_reject_training_and_unrelated_career_books():
    motivating = _book(
        "나를 변화시키는 좋은 습관",
        "성공한 사람들의 경험담에서 습관을 만들고 삶을 바꾸는 방법을 찾습니다.",
        "실전", ["습관"],
    )
    training = _book(
        "NCS기반의 창의적 문제해결능력:자기계발능력",
        "NCS기반의 능력에 대해 다루며 기초적인 학습 내용을 설명합니다.",
        "입문", ["자기계발"],
    )
    career = _book(
        "진로탐색 및 취업과 창업",
        "취업 준비생을 위한 학습 내용과 최근 경향을 정리한 도서입니다.",
        "비즈니스", ["창업"],
    )

    assert is_search_candidate(motivating, domain="자기계발")
    assert not is_search_candidate(training, domain="자기계발")
    assert not is_search_candidate(career, domain="자기계발")


@pytest.mark.asyncio
async def test_gemini_http_error_does_not_log_api_key(monkeypatch, caplog):
    original_client = httpx.AsyncClient
    request_count = 0

    def rate_limit(request):
        nonlocal request_count
        request_count += 1
        return httpx.Response(429)

    transport = httpx.MockTransport(rate_limit)
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kwargs: original_client(transport=transport, timeout=kwargs.get("timeout")),
    )
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", "private-test-key")
    monkeypatch.setattr(query_rewriter, "GEMINI_API_KEY", "private-test-key")
    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    query_rewriter._rewrite_cache.clear()

    books = [{"isbn": "1", "title": "책"}]
    assert await query_rewriter.rewrite_query("다른 검색", IntentMetadata(raw_query="다른 검색")) is None
    assert await reranker.rerank_with_gemini("검색", books) == books
    assert request_count == 1

    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    assert await reranker.rerank_with_gemini("검색", books) == books
    assert await reranker.rerank_with_gemini("검색", books) == books
    assert request_count == 2
    assert "private-test-key" not in caplog.text
    assert "429" in caplog.text
