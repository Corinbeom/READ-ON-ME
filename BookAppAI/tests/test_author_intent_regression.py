import pytest

from app.services.intent_classifier import IntentAnalyzer


@pytest.mark.asyncio
async def test_author_intent_extracts_focus_author():
    analyzer = IntentAnalyzer()
    intent = await analyzer.analyze("김영하 작가의 소설 추천해줘")
    assert intent.query_type == "author"
    assert intent.focus_author == "김영하"


@pytest.mark.asyncio
async def test_author_intent_is_not_triggered_by_mood_tokens():
    analyzer = IntentAnalyzer()
    intent = await analyzer.analyze("감성 작가의 책 추천해줘")  # '감성'은 무드 토큰
    # author 패턴에 걸릴 수 있는 문장이지만 invalid token 방어가 동작해야 함
    assert intent.focus_author is None
    assert intent.query_type in {"mood", "general"}








