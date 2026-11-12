import json

import httpx
import pytest

from app.services import book_ai_service, llm_cooldown, query_rewriter, reranker
from app.services.intent_classifier import IntentMetadata
from app.services.reranker import _book_evidence, _parse_selection
from app.services.text_utils import infer_book_form, is_school_anthology, is_search_candidate


@pytest.fixture(autouse=True)
def reset_reranker_cooldown(monkeypatch):
    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    monkeypatch.setattr(llm_cooldown, "_transient_failures", 0)


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


def test_novel_search_excludes_literary_analysis_but_keeps_the_story():
    analysis = _book(
        "고전 소설의 착한 주인공들",
        "고전 소설의 연구 및 감상을 정리한 책으로 여러 인물을 분석합니다.",
        "소설", ["문학"],
    )
    story = _book(
        "고전 소설의 착한 주인공",
        "고전 속 인물이 긴 여행을 떠나 새로운 친구들을 만나는 소설입니다.",
        "소설", ["문학"],
    )
    assert not is_search_candidate(analysis, genre="소설")
    assert is_search_candidate(story, genre="소설")


def test_general_novel_search_prefers_regular_books_without_removing_school_anthologies():
    school_collection = _book(
        "한국단편소설 40",
        "한국 단편 소설을 수록한 중고생 문학 필독서 시리즈로 청소년과 성인이 읽을 수 있습니다.",
        "소설", ["소설"],
    )
    regular_novel = _book(
        "밝은 밤", "한 가족의 삶과 관계를 그린 첫 장편소설입니다.", "소설", ["소설"],
    )
    assert is_school_anthology(school_collection)
    assert not is_school_anthology(regular_novel)
    assert is_search_candidate(school_collection, genre="소설", requested_form="STORY")

    general = IntentMetadata(raw_query="소설 추천해줘", genre="소설", requested_form="STORY")
    assert book_ai_service._prefer_general_novels([school_collection, regular_novel], general) == [
        regular_novel, school_collection,
    ]
    explicit = IntentMetadata(raw_query="중고생 소설 선집 추천", genre="소설", requested_form="STORY")
    assert book_ai_service._prefer_general_novels([school_collection, regular_novel], explicit) == [
        school_collection, regular_novel,
    ]


def test_narrow_genre_model_input_includes_reviewed_exact_matches_without_changing_fallback_order():
    ranked = [{"isbn": str(index), "source": "LEGACY"} for index in range(12)]
    reviewed = {
        "isbn": "reviewed", "source": "CURATED_SEED", "recommendation_status": "ACTIVE",
        "classification_version": "model:reviewed", "keyword": "SF", "tags": ["SF", "소설"],
    }
    candidates = [*ranked, reviewed]
    top = reranker._select_model_input(candidates, "SF")
    assert len(top) == 10
    assert [book["isbn"] for book in top[:8]] == [str(index) for index in range(8)]
    assert [book["isbn"] for book in top[8:]] == ["reviewed", "8"]
    assert "reviewed" in {book["isbn"] for book in reranker._select_model_input(candidates, "sf")}
    assert [book["isbn"] for book in candidates[:5]] == [str(index) for index in range(5)]
    assert [book["isbn"] for book in reranker._select_model_input(candidates, "소설")] == [
        str(index) for index in range(10)
    ]
    assert [book["isbn"] for book in reranker._select_model_input(
        [*ranked, {**reviewed, "classification_version": "model"}], "SF",
    )] == [str(index) for index in range(10)]


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
    diagnostics = {}
    selected = _parse_selection(
        '[{"isbn":"1","reason":"우주 전쟁의 결말을 보여줍니다.","evidence_quote":"우주 전쟁의 결말을 자세히 보여줍니다"}]', books,
        diagnostics=diagnostics,
    )
    assert selected is not None and [book["isbn"] for book in selected] == ["1"]
    assert "reason" not in selected[0]
    assert diagnostics["reason_rejections"] == [{"isbn": "1", "code": "QUOTE_MISMATCH"}]


def test_grounded_reason_survives_small_model_length_overruns():
    quote = "책 소개에 실제로 등장하는 근거 문장입니다. " * 5
    quote = quote[:123]
    reason = "책 소개에 근거해 읽을 만한 내용을 설명합니다. " * 4
    reason = reason[:104]
    book = {"isbn": "1", "title": "근거 있는 책", "contents": quote + " 다른 설명도 있습니다."}
    assert len(reason) == 104 and len(quote) == 123

    selected = _parse_selection(json.dumps([{
        "isbn": "1", "reason": reason, "evidence_quote": quote,
    }], ensure_ascii=False), [book])
    assert selected is not None
    assert selected[0]["reason"] == reason
    assert selected[0]["reason_evidence"] == quote.strip()

    diagnostics = {}
    too_long = _parse_selection(json.dumps([{
        "isbn": "1", "reason": reason + "추가 설명" * 10, "evidence_quote": quote,
    }], ensure_ascii=False), [book], diagnostics=diagnostics)
    assert too_long is not None and "reason" not in too_long[0]
    assert diagnostics["reason_rejections"] == [{"isbn": "1", "code": "REASON_TOO_LONG"}]


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
async def test_explicit_sf_fallback_keeps_verified_unknown_story_but_rejects_guides(monkeypatch, caplog):
    original_client = httpx.AsyncClient

    def timeout(request):
        raise httpx.ReadTimeout("test timeout", request=request)

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(timeout), timeout=kwargs.get("timeout"),
    ))
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    sf_story = {
        "isbn": "sf-story", "title": "SF보다 Vol 1 얼음",
        "contents": "이 계절의 SF 소설 선정작을 소개하며 미래 기술과 상상력을 다룬 작품을 담았습니다.",
        "keyword": "SF", "tags": ["SF", "소설"],
    }
    sf_guide = {
        "isbn": "sf-guide", "title": "SF 소설 읽기",
        "contents": "SF 소설의 역사와 주요 작품을 분석하는 비평서입니다.",
        "keyword": "SF", "tags": ["SF"],
    }
    assert infer_book_form(sf_story["title"], sf_story["contents"]) == "UNKNOWN"
    outcome = {}
    result = await reranker.rerank_with_gemini(
        "SF 소설 추천", [sf_story, sf_guide], "STORY", genre="SF", outcome=outcome,
    )
    assert [(book["isbn"], book["ranking_status"]) for book in result] == [
        ("sf-story", "FALLBACK"),
    ]
    assert outcome == {"status": "FALLBACK", "reason_code": "TIMEOUT"}
    assert "reason=TIMEOUT" in caplog.text
    assert await reranker.rerank_with_gemini("이야기 추천", [sf_story], "STORY") == []


@pytest.mark.asyncio
async def test_fantasy_fallback_rejects_genre_overview_without_work_evidence(monkeypatch):
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", None)
    overview = {"isbn": "overview", "title": "판타지", "keyword": "판타지", "tags": ["판타지"],
                "contents": "환상문학의 개념을 정립하고 마법이 등장하는 작품을 기독교적으로 보는 관점을 설명합니다."}
    story = {"isbn": "story", "title": "치우와 파수꾼의 탑", "keyword": "판타지", "tags": ["판타지"],
             "contents": "한국 판타지소설의 소년 주인공이 마법사의 땅에서 모험을 펼치는 작품입니다."}
    series = {"isbn": "series", "title": "룬의 아이들 블러디드 6", "keyword": "판타지", "tags": ["판타지"],
              "contents": "아름다운 세계관과 개성 넘치는 캐릭터로 사랑받는 한국 판타지 신작입니다."}
    assert is_search_candidate(overview, genre="판타지", requested_form="STORY")
    result = await reranker.rerank_with_gemini("판타지 소설 추천", [overview, story, series], "STORY", genre="판타지")
    assert [book["isbn"] for book in result] == ["story", "series"]


@pytest.mark.asyncio
async def test_general_intro_fallback_skips_clear_training_books_but_keeps_reader_books(monkeypatch):
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", None)
    books = [
        {"isbn": "counselor", "title": "청소년 심리 및 상담", "contents":
         "예비 청소년상담사를 위한 상담입문서입니다. 상담 이론을 설명하고 연습문제를 수록합니다."},
        {"isbn": "manual", "title": "심리검사의 종류와 활용", "contents":
         "심리검사의 종류와 활용에 대해 다룬 이론서입니다. 기초 내용을 학습할 수 있도록 구성했습니다."},
        {"isbn": "reader", "title": "나 혼자만 알고 싶은 실전 심리학", "contents":
         "일반인이 이해하기 어려운 심리학을 일상의 인간관계 속에서 쉽게 설명합니다."},
        {"isbn": "memoir", "title": "마음의 이야기", "contents":
         "한 사람이 자신의 마음을 돌아보는 경험을 담은 책입니다."},
        {"isbn": "intro", "title": "심리학 첫걸음", "contents":
         "심리학을 처음 읽는 사람에게 주요 개념을 알기 쉽게 소개합니다."},
        {"isbn": "late", "title": "나중 후보", "contents":
         "일반 독자가 이해할 수 있게 심리학을 설명하는 책입니다."},
    ]
    result = await reranker.rerank_with_gemini("심리학 입문 책 추천", books)
    assert [book["isbn"] for book in result] == ["reader", "memoir", "intro"]
    assert result[0]["ranking_status"] == "FALLBACK"

    specialist = await reranker.rerank_with_gemini("상담사 심리검사 입문 교재", books)
    assert [book["isbn"] for book in specialist] == ["counselor", "manual", "reader", "memoir", "intro"]


@pytest.mark.asyncio
async def test_finance_intro_fallback_skips_school_curriculum_but_explicit_teen_request_keeps_it(monkeypatch):
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", None)
    reader = {"isbn": "reader", "title": "최소한의 경제공부", "contents":
              "경제 이슈를 재테크에 적용하는 데 필요한 기초 지식을 일반 독자에게 설명합니다."}
    curriculum = {"isbn": "curriculum", "title": "경제수학, 위기의 편의점을 살려라!", "contents":
                  "청소년들이 중학교 교과과정만으로 경제수학을 익히고 고교학점제를 준비하도록 만든 책입니다."}
    professional = {"isbn": "professional", "title": "투자상담사 자격시험", "contents":
                    "투자상담사 자격시험을 준비하는 수험생을 위한 연습문제와 풀이를 담았습니다."}

    general = await reranker.rerank_with_gemini("재테크 기초 책 추천", [reader, curriculum, professional])
    explicit = await reranker.rerank_with_gemini("10대 재테크 기초 책 추천", [reader, curriculum, professional])

    assert [book["isbn"] for book in general] == ["reader"]
    assert [book["isbn"] for book in explicit] == ["reader", "curriculum"]


@pytest.mark.asyncio
async def test_general_intro_keeps_training_books_out_of_gemini_candidates(monkeypatch):
    original_client = httpx.AsyncClient
    requests = []

    def respond(request):
        requests.append(json.loads(request.content))
        selected = [{"isbn": "reader", "reason": "일반 독자에게 심리학을 쉽게 소개합니다.",
                     "evidence_quote": "심리학을 처음 읽는 일반 독자에게 쉽게 소개합니다"}]
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(selected, ensure_ascii=False)}]}}]})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(respond), timeout=kwargs.get("timeout"),
    ))
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    books = [
        {"isbn": "counselor", "title": "청소년 심리 및 상담", "contents":
         "예비 청소년상담사를 위한 상담입문서입니다. 상담 이론과 연습문제를 수록합니다."},
        {"isbn": "curriculum", "title": "경제수학, 위기의 편의점을 살려라!", "contents":
         "청소년들이 중학교 교과과정만으로 경제수학을 익히고 고교학점제를 준비하도록 만든 책입니다."},
        {"isbn": "reader", "title": "심리학 첫걸음", "contents":
         "심리학을 처음 읽는 일반 독자에게 쉽게 소개합니다."},
    ]
    diagnostics = {}
    result = await reranker.rerank_with_gemini("심리학 입문 책 추천", books, diagnostics=diagnostics)
    assert [book["isbn"] for book in result] == ["reader"]
    assert result[0]["ranking_status"] == "GEMINI"
    assert diagnostics["model_input_isbns"] == ["reader"]
    assert diagnostics["model_selected_isbns"] == ["reader"]
    assert "counselor" not in requests[0]["contents"][0]["parts"][0]["text"]
    assert "curriculum" not in requests[0]["contents"][0]["parts"][0]["text"]

    await reranker.rerank_with_gemini("상담사 심리검사 입문 교재", books)
    assert "counselor" in requests[1]["contents"][0]["parts"][0]["text"]
    assert "curriculum" in requests[1]["contents"][0]["parts"][0]["text"]

    await reranker.rerank_with_gemini("10대 심리학 입문", books)
    assert "counselor" not in requests[2]["contents"][0]["parts"][0]["text"]
    assert "curriculum" in requests[2]["contents"][0]["parts"][0]["text"]


@pytest.mark.asyncio
async def test_rate_limit_fallback_records_cause(monkeypatch, caplog):
    original_client = httpx.AsyncClient

    def respond(request):
        return httpx.Response(429, request=request)

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(respond), timeout=kwargs.get("timeout"),
    ))
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    calls = []
    monkeypatch.setattr(llm_cooldown, "rate_limited", lambda: calls.append(True))

    outcome = {}
    result = await reranker.rerank_with_gemini(
        "심리학 입문 책 추천",
        [{"isbn": "reader", "title": "심리학 이야기", "contents": "심리학을 처음 읽는 일반 독자에게 쉽게 소개합니다."}],
        outcome=outcome,
    )
    assert [book["isbn"] for book in result] == ["reader"]
    assert calls == [True]
    assert outcome == {"status": "FALLBACK", "reason_code": "HTTP_429"}
    assert "reason=HTTP_429" in caplog.text


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
    sf_story = [{"isbn": "2", "title": "SF보다 Vol 1 얼음", "keyword": "SF", "tags": ["소설"],
                 "contents": "SF 소설 선정작을 소개하며 미래 기술과 상상력을 다룬 작품을 담았습니다."}]
    assert await reranker.rerank_with_gemini("SF 소설 추천", sf_story, "STORY", genre="SF") == []
    assert len(requests) == 2
    assert requests[0]["generationConfig"]["responseSchema"]["type"] == "ARRAY"
    assert requests[0]["generationConfig"]["responseMimeType"] == "application/json"


@pytest.mark.asyncio
async def test_reranker_distinguishes_model_no_match_from_upstream_empty(monkeypatch):
    original_client = httpx.AsyncClient
    responses = [
        httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "[]"}]}}]}),
        httpx.Response(503),
    ]
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(lambda request: responses.pop(0)), timeout=kwargs.get("timeout"),
    ))
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", "test-key")
    book = {"isbn": "one", "title": "다른 작가의 소설", "contents": "가족의 기억과 상실을 그린 장편소설입니다."}
    no_match = {}
    degraded = {}
    assert await reranker.rerank_with_gemini("비슷한 소설", [book], "STORY", outcome=no_match) == []
    assert no_match == {"status": "NO_MATCH", "reason_code": "MODEL_NO_MATCH"}
    assert await reranker.rerank_with_gemini(
        "비슷한 소설", [book], "STORY", outcome=degraded, verified_fallback=[],
    ) == []
    assert degraded == {"status": "DEGRADED_EMPTY", "reason_code": "HTTP_503"}


@pytest.mark.asyncio
async def test_transient_failure_cooldown_skips_third_llm_call(monkeypatch):
    original_client = httpx.AsyncClient
    calls = []

    def unavailable(request):
        calls.append(request)
        return httpx.Response(503)

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original_client(
        transport=httpx.MockTransport(unavailable), timeout=kwargs.get("timeout"),
    ))
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", "test-key")
    book = {"isbn": "one", "title": "소설", "contents": "가족의 이야기를 그린 장편소설입니다."}
    outcomes = []
    for _ in range(3):
        outcome = {}
        await reranker.rerank_with_gemini("소설 추천", [book], "STORY", outcome=outcome)
        outcomes.append(outcome)
    assert len(calls) == 2
    assert [outcome["reason_code"] for outcome in outcomes] == ["HTTP_503", "HTTP_503", "COOLDOWN"]
    assert all(outcome["status"] == "FALLBACK" for outcome in outcomes)


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
    assert not is_search_candidate(unknown, requested_form="STORY")
    unknown_unclassified = _book("조용한 책", unknown["contents"], "user_added", ["user_added"])
    assert not is_search_candidate(unknown_unclassified, requested_form="STORY")
    assert not is_search_candidate(story, requested_form="PRACTICAL")


def test_story_request_excludes_pilot_guides_without_excluding_actual_stories():
    guide = _book(
        "명상심리치료입문",
        "명상과 심리학을 결부시켜 내면의 감정과 생각을 돌이켜 보도록 돕는 입문 책입니다.",
        "심리", ["심리", "입문"],
    )
    copying = _book(
        "하루 한 줄 마음 챙김 필사책",
        "세계 문학 속 문장을 따라 쓰면서 마음을 가다듬는 과정을 함께합니다.",
        "철학", ["철학"],
    )
    novel = _book(
        "날씨가 좋으면 찾아가겠어요",
        "시골 마을의 작은 독립서점을 배경으로 주인공들이 관계를 회복하는 장편소설입니다.",
        "소설", ["소설"],
    )
    poetry = _book(
        "사랑하고 선량하게 잦아드네",
        "시인이 두번째 시집을 펴내며 사랑과 희망에 관해 적었습니다.",
        "user_added", ["시집"],
    )
    essay = _book(
        "감정의 색깔",
        "다양한 감정의 층위를 돌아보고 나를 받아들이도록 돕는 에세이입니다.",
        "에세이", ["감정"],
    )
    picture_book = _book(
        "수박 수영장",
        "수박 안에서 이웃들이 함께 수영하며 즐겁게 노는 모습을 그린 따뜻한 그림책입니다.",
        "그림책", ["아동문학", "따뜻한"],
    )
    about_sf = _book(
        "SF 소설 읽기",
        "SF 소설의 세계를 조망하고 교사가 학생들의 동아리 활동을 지도하는 데 도움을 줍니다.",
        "SF", ["SF"],
    )
    mislabeled_essay = _book(
        "로드 판타지",
        "길에서 만난 스무 개 풍경을 스무 개의 에세이로 담은 책입니다.",
        "판타지", ["판타지"],
    )
    literary_analysis = _book(
        "고전 소설의 착한 주인공들",
        "고전소설의 연구 및 감상을 정리하고 여러 작품의 인물을 분석합니다.",
        "소설", ["소설"],
    )
    assert not is_search_candidate(guide, requested_form="STORY")
    assert not is_search_candidate(copying, requested_form="STORY")
    assert not is_search_candidate(poetry, requested_form="STORY")
    assert not is_search_candidate(essay, requested_form="STORY")
    assert not is_search_candidate(about_sf, requested_form="STORY")
    assert not is_search_candidate(mislabeled_essay, requested_form="STORY")
    assert not is_search_candidate(literary_analysis, requested_form="STORY")
    assert is_search_candidate(novel, requested_form="STORY")
    assert is_search_candidate(picture_book, requested_form="STORY")


def test_korean_novel_constraint_uses_work_evidence_not_korean_language_or_publisher():
    translated = _book(
        "당신 인생의 이야기",
        "과학소설 작가 테드 창의 SF 소설집을 한국어로 번역해 출간했습니다.",
        "SF", ["SF", "소설"],
    )
    known = _book(
        "여성작가 SF 단편모음집",
        "동시대 한국 여성 작가의 SF를 모은 소설집으로 여러 단편을 수록했습니다.",
        "SF", ["SF", "한국"],
    )
    unknown = _book(
        "날씨가 좋으면 찾아가겠어요",
        "시골 마을 책방에서 주인공들이 다시 만나는 장편소설입니다.",
        "소설", ["소설"],
    )
    assert is_search_candidate(translated, genre="소설", requested_form="STORY")
    assert not is_search_candidate(translated, genre="소설", requested_form="STORY", constraints=["한국"])
    assert is_search_candidate(known, genre="소설", requested_form="STORY", constraints=["한국"])
    assert is_search_candidate(known, genre="SF", requested_form="STORY", constraints=["한국"])
    assert not is_search_candidate(translated, genre="SF", requested_form="STORY", constraints=["한국"])
    assert not is_search_candidate(unknown, genre="소설", requested_form="STORY", constraints=["한국"])
    assert is_search_candidate(
        {**unknown, "kdc_code": "813.7", "kdc_source": "DATA4LIBRARY"},
        genre="소설", requested_form="STORY", constraints=["한국"],
    )
    assert not is_search_candidate(
        {**known, "kdc_code": "843.6", "kdc_source": "DATA4LIBRARY"},
        genre="소설", requested_form="STORY", constraints=["한국"],
    )
    assert not is_search_candidate(
        {**unknown, "kdc_code": "813.7", "kdc_source": "UNVERIFIED"},
        genre="소설", requested_form="STORY", constraints=["한국"],
    )


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
    sf_writing_guide = _book(
        "SF단편소설 쓰기", "청소년이 SF 글쓰기 코칭을 통해 단편소설을 창작하도록 돕는 지도서입니다.",
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
    assert not is_search_candidate(sf_writing_guide, genre="SF")
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
