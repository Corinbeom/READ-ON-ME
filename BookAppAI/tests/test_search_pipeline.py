import json

import httpx
import pytest

from app.services import llm_cooldown, query_rewriter, reranker
from app.services.intent_classifier import IntentMetadata
from app.services.reranker import _book_evidence, _parse_selection
from app.services.text_utils import infer_book_form, is_search_candidate


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


def test_recommendations_exclude_multi_book_sets_without_rejecting_single_books():
    description = "서로 다른 인물들이 성장하며 따뜻한 관계를 만들어 가는 이야기입니다."
    assert not is_search_candidate(_book("어린이 자기계발 동화 시리즈 세트(전30권)", description, "문학", ["동화"]))
    assert not is_search_candidate(_book("성장 동화 전 3권", description, "문학", ["동화"]))
    assert not is_search_candidate(_book("세계문학 중단편세트(NOON)", description, "문학", ["동화"]))
    assert is_search_candidate(_book("마인드세트", description, "문학", ["동화"]))
    assert is_search_candidate(_book("세계를 건너 너에게 갈게", description, "문학", ["동화"]))


def test_reranker_selection_ignores_duplicate_and_unknown_isbns():
    books = [
        {"isbn": "1", "title": "첫 번째", "contents": "첫 번째 책은 조용한 마을을 배경으로 사람들의 만남을 그립니다."},
        {"isbn": "2", "title": "두 번째", "contents": "두 번째 책은 먼 여행 중 만나는 가족의 이야기를 담았습니다."},
    ]

    selected = _parse_selection(
        '[{"isbn":"2","reason":"가족의 여정을 담았습니다.","evidence_quote":"먼 여행 중 만나는 가족의 이야기"},'
        '{"isbn":"2","reason":"중복"},{"isbn":"99","reason":"없는 책"},'
        '{"isbn":"1","reason":"마을의 만남을 그립니다.","evidence_quote":"조용한 마을을 배경으로 사람들의 만남"}]',
        books,
    )

    assert [(book["isbn"], book["reason"]) for book in selected] == [
        ("2", "가족의 여정을 담았습니다."),
        ("1", "마을의 만남을 그립니다."),
    ]
    assert _parse_selection("2|이전 형식", books) is None
    assert _parse_selection("[]", books) == []
    assert _parse_selection('[{"isbn":"99","reason":"없는 책"}]', books) is None


def test_unverifiable_reason_is_omitted_and_book_still_selected():
    books = [{"isbn": "1", "title": "따뜻한 책", "contents": "따뜻한 책은 작은 동네의 이웃들이 함께 살아가는 모습을 담은 소설입니다."}]
    selected = _parse_selection(
        '[{"isbn":"1","reason":"우주 전쟁의 결말을 보여줍니다.","evidence_quote":"우주 전쟁의 결말"}]', books,
    )
    assert selected is not None and [book["isbn"] for book in selected] == ["1"]
    assert "reason" not in selected[0]


@pytest.mark.asyncio
async def test_story_fallback_requires_narrative_evidence(monkeypatch):
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", None)
    books = [
        {"isbn": "guide", "title": "창업의 이해", "contents": "창업 이론과 절차를 소개합니다."},
        {"isbn": "story", "title": "창업의 밤", "contents": "작은 가게를 시작한 사람의 회고록입니다."},
    ]
    result = await reranker.rerank_with_gemini("스타트업 이야기가 궁금해", books, "STORY")
    assert [(book["isbn"], book["ranking_status"]) for book in result] == [("story", "FALLBACK")]
    assert await reranker.rerank_with_gemini("스타트업 이야기가 궁금해", books[:1], "STORY") == []


@pytest.mark.asyncio
async def test_reranker_uses_one_structured_call_and_accepts_no_match(monkeypatch):
    original_client = httpx.AsyncClient
    requests = []

    def respond(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "[]"}]}}]})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(respond), timeout=kwargs.get("timeout"),
    ))
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    books = [{"isbn": "1", "title": "실용서", "contents": "실용적인 방법을 차근차근 알려주는 책입니다."}]
    assert await reranker.rerank_with_gemini("서사 중심 책", books) == []
    assert len(requests) == 1
    assert requests[0]["generationConfig"]["responseSchema"]["type"] == "ARRAY"
    assert requests[0]["generationConfig"]["responseMimeType"] == "application/json"


def test_evidence_skips_author_bio_when_book_description_follows():
    book = {
        "title": "느린 마음",
        "contents": "저자는 여러 작품을 펴냈으며 오랫동안 글을 써 왔습니다. "
                    "느린 마음은 작은 동네에서 서로를 돌보는 사람들의 이야기입니다.",
    }
    assert _book_evidence(book).startswith("느린 마음은 작은 동네")


def test_story_request_rejects_clear_practical_guides_but_keeps_narratives_and_unknowns():
    guide = _book("마음챙김 대화", "청소년 자기계발서로 49가지 상황별 대화법과 실천 방법을 소개합니다.", "자기계발", ["자기계발"])
    story = _book("마음을 키우는 동화", "아이들이 서로를 이해하며 성장하는 이야기를 담은 창작 동화입니다.", "자기계발", ["동화"])
    memoir = _book("창업의 밤", "작은 가게를 시작한 한 사람의 회고록으로 실패와 재도전의 서사를 그립니다.", "비즈니스", ["회고록"])
    startup_guide = _book("기업가정신과 창업", "창업 관련 서적과 연구논문을 반영하고 현장 사례를 예비창업자에게 소개하였다.", "비즈니스", ["창업"])
    unknown = _book("조용한 책", "사람과 마음에 관해 다양한 생각과 경험을 담은 책입니다.", "인문학", ["인문학"])
    assert infer_book_form(guide["title"], guide["contents"]) == "PRACTICAL"
    assert not is_search_candidate(guide, requested_form="STORY")
    assert is_search_candidate(guide, requested_form="PRACTICAL")
    assert is_search_candidate(story, requested_form="STORY")
    assert is_search_candidate(memoir, requested_form="STORY")
    assert not is_search_candidate(startup_guide, domain="비즈니스", requested_form="STORY")
    assert is_search_candidate(unknown, requested_form="STORY")


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
    career_theory = _book(
        "자기계발과 직업",
        "직업 변화와 자기계발에 대한 이론적 기초를 다루는 책입니다.",
        "입문", ["자기계발"],
    )

    assert is_search_candidate(motivating, domain="자기계발")
    assert not is_search_candidate(training, domain="자기계발")
    assert not is_search_candidate(career, domain="자기계발")
    assert not is_search_candidate(career_theory, domain="자기계발")


def test_subject_requires_book_description_evidence_even_when_label_is_wrong():
    unrelated = _book(
        "ERP 정보관리사 물류 2급", "물류 자격 시험을 준비하며 재고 관리를 연습하는 책입니다.",
        "정치", ["정치"],
    )
    politics = _book(
        "정의란 무엇인가", "정치철학을 통해 정의와 공동체의 문제를 살펴보고 민주주의의 의미를 묻습니다.",
        "정치", ["정치"],
    )
    assert not is_search_candidate(unrelated, domain="정치")
    assert is_search_candidate(politics, domain="정치")


def test_specific_genres_require_specific_evidence_and_reject_books_about_genres():
    anthology = _book(
        "한국단편소설 40", "한국 단편 소설 작품을 모은 선집입니다.",
        "소설", ["소설"],
    )
    romance = _book(
        "화이트 웨딩 판타지(할리퀸 로맨스)", "웨딩플래너가 친구의 오빠와 다시 만나 사랑에 빠지는 이야기입니다.",
        "판타지", ["판타지"],
    )
    scam = _book(
        "범죄의 심리학", "보이스피싱과 로맨스 스캠 범죄를 설명하는 심리학 책입니다.",
        "심리", ["로맨스"],
    )
    about_sf = _book(
        "SF 소설 읽기", "SF 소설의 역사와 주요 작품을 분석하는 비평서입니다.",
        "SF", ["SF"],
    )
    sf_guide = _book(
        "SF란 무엇인가?", "과학소설의 본질과 SF 문학의 역사를 설명하는 개론서입니다.",
        "SF", ["SF"],
    )
    genre_writing = _book(
        "장르 글쓰기. 1: SF 판타지 공포", "로맨스와 미스터리 장르의 작법 노하우를 설명합니다.",
        "판타지", ["판타지", "로맨스"],
    )
    psychology_about_romance = _book(
        "셰익스피어, 인간심리 속 문장의 기억", "로맨스 코미디의 서사를 심리학적으로 해석한 문학 비평서입니다.",
        "심리", ["심리", "로맨스"],
    )
    sf_criticism = _book(
        "한국문학의 SF적 전회와 윤리적 사변들", "한국 SF 문학을 분석하고 연구하는 비평서입니다.",
        "SF", ["SF"],
    )
    fantasy_criticism = _book(
        "멋진 판타지", "어린이문학평론가가 쓴 판타지 평론집으로 장르의 역사를 설명합니다.",
        "판타지", ["판타지"],
    )
    sf_novel = _book(
        "화씨 451", "검열과 통제가 일상이 된 미래 사회를 그린 SF 소설입니다.",
        "SF", ["소설", "SF"],
    )
    assert not is_search_candidate(anthology, genre="로맨스")
    assert is_search_candidate(romance, genre="로맨스")
    assert not is_search_candidate(scam, genre="로맨스")
    assert not is_search_candidate(about_sf, genre="SF")
    assert not is_search_candidate(sf_guide, genre="SF")
    assert not is_search_candidate(genre_writing, genre="로맨스")
    assert not is_search_candidate(psychology_about_romance, genre="로맨스")
    assert not is_search_candidate(sf_criticism, genre="SF")
    assert not is_search_candidate(fantasy_criticism, genre="판타지")
    assert is_search_candidate(sf_novel, genre="SF")


def test_political_novel_needs_both_subject_and_fiction_evidence():
    political_novel = _book(
        "1984", "전체주의 국가의 감시와 권력에 맞서는 인물을 그린 디스토피아 소설입니다.",
        "디스토피아", ["정치 소설", "SF"],
    )
    political_nonfiction = _book(
        "박근혜 회고록", "대통령의 정치 일대기를 기록한 회고록입니다.",
        "정치", ["회고록"],
    )
    assert is_search_candidate(political_novel, genre="정치 소설", domain="정치")
    assert not is_search_candidate(political_nonfiction, genre="정치 소설", domain="정치")
    political_memoir = _book(
        "박근혜 회고록", "전 대통령의 정치 일대기와 선거 이야기를 담은 회고록입니다.",
        "정치", ["정치", "회고록"],
    )
    assert not is_search_candidate(political_memoir, genre="정치 소설", domain="정치")


def test_warm_healing_novel_is_not_treated_as_thriller_from_author_bio():
    warm_novel = _book(
        "불편한 편의점", "스릴러 장르도 써온 작가의 신작 소설로 이웃들의 삶을 따뜻하고 유머러스하게 그렸습니다.",
        "스릴러", ["스릴러", "힐링"],
    )
    assert not is_search_candidate(warm_novel, genre="스릴러")


def test_essay_and_nonfiction_do_not_accept_fiction_or_poetry_mislabeled_as_essay():
    novel = _book(
        "가녀장의 시대", "에세이스트로 유명한 작가가 첫 장편소설을 발표했습니다.",
        "에세이", ["에세이", "소설"],
    )
    poetry = _book(
        "작약과 공터", "시와 에세이를 써온 시인이 여섯 번째 시집을 펴냈습니다.",
        "에세이", ["에세이", "시집"],
    )
    essay = _book(
        "나는 왜 쓰는가", "장편소설 동물농장을 쓴 작가의 삶과 정치에 대한 생각을 담은 에세이 29편을 모았습니다.",
        "에세이", ["에세이"],
    )
    assert not is_search_candidate(novel, genre="에세이")
    assert not is_search_candidate(poetry, genre="에세이")
    assert is_search_candidate(essay, genre="에세이")
    assert not is_search_candidate(novel, genre="논픽션")


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
    fallback = [{**books[0], "ranking_status": "FALLBACK"}]
    assert await query_rewriter.rewrite_query("다른 검색", IntentMetadata(raw_query="다른 검색")) is None
    assert await reranker.rerank_with_gemini("검색", books) == fallback
    assert request_count == 1

    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    assert await reranker.rerank_with_gemini("검색", books) == fallback
    assert await reranker.rerank_with_gemini("검색", books) == fallback
    assert request_count == 2
    assert "private-test-key" not in caplog.text
    assert "429" in caplog.text
