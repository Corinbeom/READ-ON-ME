import json

import httpx
import pytest

from app.services import llm_cooldown, reranker


BOOK = {
    "isbn": "9780000000001", "title": "느린 마음", "authors": "홍길동",
    "contents": "작은 동네에서 서로를 돌보는 사람들의 이야기를 담은 장편소설입니다.",
}
SELECTION = {
    "isbn": BOOK["isbn"],
    "reason": "동네 사람들의 관계를 그린 이야기입니다.",
    "evidence_quote": "서로를 돌보는 사람들의 이야기를 담은 장편소설입니다.",
}


@pytest.fixture(autouse=True)
def reset_provider_state(monkeypatch):
    monkeypatch.setattr(reranker, "GEMINI_API_KEY", "gemini-test-key")
    monkeypatch.setenv("GROQ_API_KEY", "groq-test-key")
    monkeypatch.setattr(llm_cooldown, "_blocked_until", 0.0)
    monkeypatch.setattr(llm_cooldown, "_transient_failures", 0)
    monkeypatch.setattr(reranker, "groq_cooldown", llm_cooldown.ProviderCooldown())


def mock_client(monkeypatch, responder):
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(
        transport=httpx.MockTransport(responder), timeout=kwargs.get("timeout"),
    ))


def groq_response(selections):
    return httpx.Response(200, json={
        "choices": [{"message": {"content": json.dumps({"selections": selections}, ensure_ascii=False)}}],
        "usage": {"prompt_tokens": 700, "completion_tokens": 120},
    })


@pytest.mark.asyncio
async def test_gemini_503_uses_grounded_groq_result(monkeypatch, caplog):
    calls = []

    def respond(request):
        calls.append(request)
        if request.url.host == "api.groq.com":
            payload = json.loads(request.content)
            assert payload["response_format"]["json_schema"]["strict"] is True
            assert request.headers["Authorization"] == "Bearer groq-test-key"
            return groq_response([SELECTION])
        return httpx.Response(503)

    mock_client(monkeypatch, respond)
    outcome, diagnostics = {}, {}
    result = await reranker.rerank_with_gemini(
        "따뜻한 소설 추천", [BOOK], "STORY", outcome=outcome, diagnostics=diagnostics,
    )
    assert [call.url.host for call in calls] == ["generativelanguage.googleapis.com", "api.groq.com"]
    assert result[0]["ranking_status"] == "GROQ"
    assert result[0]["reason"] == SELECTION["reason"]
    assert result[0]["reason_evidence"] == SELECTION["evidence_quote"]
    assert outcome == {"status": "MODEL", "reason_code": "GROQ_AFTER_HTTP_503"}
    assert diagnostics["groq_usage"] == {"input_tokens": 700, "output_tokens": 120}
    assert "groq-test-key" not in caplog.text


@pytest.mark.asyncio
async def test_valid_gemini_no_match_does_not_call_groq(monkeypatch):
    calls = []

    def respond(request):
        calls.append(request.url.host)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "[]"}]}}]})

    mock_client(monkeypatch, respond)
    outcome = {}
    assert await reranker.rerank_with_gemini("맞는 책 없음", [BOOK], outcome=outcome) == []
    assert calls == ["generativelanguage.googleapis.com"]
    assert outcome == {"status": "NO_MATCH", "reason_code": "MODEL_NO_MATCH"}


@pytest.mark.asyncio
async def test_gemini_bad_request_does_not_call_groq(monkeypatch):
    calls = []

    def respond(request):
        calls.append(request.url.host)
        return httpx.Response(400)

    mock_client(monkeypatch, respond)
    outcome = {}
    result = await reranker.rerank_with_gemini("소설 추천", [BOOK], outcome=outcome)
    assert calls == ["generativelanguage.googleapis.com"]
    assert result[0]["ranking_status"] == "FALLBACK"
    assert outcome == {"status": "FALLBACK", "reason_code": "HTTP_400"}


@pytest.mark.asyncio
async def test_groq_rate_limit_keeps_existing_fallback_and_cooldown(monkeypatch):
    calls = []

    def respond(request):
        calls.append(request.url.host)
        if request.url.host == "api.groq.com":
            return httpx.Response(429, headers={"retry-after": "120"})
        return httpx.Response(429)

    mock_client(monkeypatch, respond)
    outcome = {}
    first = await reranker.rerank_with_gemini("소설 추천", [BOOK], outcome=outcome)
    second = await reranker.rerank_with_gemini("소설 추천", [BOOK])
    assert calls == ["generativelanguage.googleapis.com", "api.groq.com"]
    assert [book["ranking_status"] for book in first + second] == ["FALLBACK", "FALLBACK"]
    assert outcome == {"status": "FALLBACK", "reason_code": "HTTP_429"}
    assert not reranker.groq_cooldown.available()


@pytest.mark.asyncio
async def test_groq_invalid_quote_does_not_surface_reason(monkeypatch):
    def respond(request):
        if request.url.host == "api.groq.com":
            return groq_response([{**SELECTION, "evidence_quote": "책 소개에 없는 허구의 줄거리입니다."}])
        return httpx.Response(503)

    mock_client(monkeypatch, respond)
    result = await reranker.rerank_with_gemini("소설 추천", [BOOK])
    assert result[0]["ranking_status"] == "GROQ"
    assert "reason" not in result[0]
    assert "reason_evidence" not in result[0]


@pytest.mark.asyncio
async def test_groq_invalid_response_uses_deterministic_fallback(monkeypatch):
    def respond(request):
        if request.url.host == "api.groq.com":
            return httpx.Response(200, json={"choices": [{"message": {"content": "not-json"}}]})
        return httpx.Response(503)

    mock_client(monkeypatch, respond)
    outcome, diagnostics = {}, {}
    result = await reranker.rerank_with_gemini("소설 추천", [BOOK], outcome=outcome, diagnostics=diagnostics)
    assert result[0]["ranking_status"] == "FALLBACK"
    assert outcome == {"status": "FALLBACK", "reason_code": "HTTP_503"}
    assert diagnostics["groq_error_reason"] == "JSONDecodeError"


@pytest.mark.asyncio
async def test_groq_valid_no_match_remains_no_match(monkeypatch):
    def respond(request):
        return groq_response([]) if request.url.host == "api.groq.com" else httpx.Response(503)

    mock_client(monkeypatch, respond)
    outcome = {}
    result = await reranker.rerank_with_gemini("맞는 책 없음", [BOOK], outcome=outcome)
    assert result == []
    assert outcome == {"status": "NO_MATCH", "reason_code": "MODEL_NO_MATCH"}


@pytest.mark.asyncio
async def test_groq_bad_credentials_stop_repeated_calls(monkeypatch):
    hosts = []

    def respond(request):
        hosts.append(request.url.host)
        return httpx.Response(401) if request.url.host == "api.groq.com" else httpx.Response(503)

    mock_client(monkeypatch, respond)
    for _ in range(2):
        result = await reranker.rerank_with_gemini("소설 추천", [BOOK])
        assert result[0]["ranking_status"] == "FALLBACK"
    assert hosts == [
        "generativelanguage.googleapis.com", "api.groq.com",
        "generativelanguage.googleapis.com",
    ]
    assert not reranker.groq_cooldown.available()


@pytest.mark.asyncio
async def test_broad_novel_request_excludes_school_anthology_from_both_models(monkeypatch):
    school = {
        "isbn": "school", "title": "한국중장편소설 베스트 12 (중고생이 꼭 읽어야 할)",
        "contents": "중고생 문학 필독서로 한국 소설 작품을 모은 선집입니다.",
    }
    assert reranker.is_school_anthology(school)
    seen_prompts = []

    def respond(request):
        if request.url.host == "api.groq.com":
            prompt = json.loads(request.content)["messages"][0]["content"]
            seen_prompts.append(prompt)
            return groq_response([{"isbn": "school", "reason": "학교 선집", "evidence_quote": school["contents"]}, SELECTION])
        return httpx.Response(503)

    mock_client(monkeypatch, respond)
    result = await reranker.rerank_with_gemini(
        "한국소설 추천", [school, BOOK], "STORY", genre="소설",
    )
    assert "school" not in seen_prompts[0]
    assert [book["isbn"] for book in result] == [BOOK["isbn"]]


@pytest.mark.asyncio
async def test_explicit_school_anthology_request_keeps_candidate(monkeypatch):
    school = {
        "isbn": "school", "title": "한국중장편소설 베스트 12 (중고생이 꼭 읽어야 할)",
        "contents": "중고생 문학 필독서로 한국 소설 작품을 모은 선집입니다.",
    }
    seen_prompts = []

    def respond(request):
        if request.url.host == "api.groq.com":
            seen_prompts.append(json.loads(request.content)["messages"][0]["content"])
            return groq_response([{"isbn": "school", "reason": "중고생용 선집입니다.",
                                   "evidence_quote": school["contents"]}])
        return httpx.Response(503)

    mock_client(monkeypatch, respond)
    result = await reranker.rerank_with_gemini(
        "중고생이 읽을 한국소설 선집 추천", [school, BOOK], "STORY", genre="소설",
    )
    assert "school" in seen_prompts[0]
    assert [book["isbn"] for book in result] == ["school"]
