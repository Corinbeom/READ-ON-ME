import pytest

from app.services.book_classifier import BookClassifier
from app.services.gemini_tagger import GeminiTagger
from app.services.intent_classifier import IntentAnalyzer, IntentMetadata
from app.services.keyword_expander import KeywordExpander
from app.services.prompt_templates import PromptTemplateBuilder


@pytest.mark.asyncio
async def test_intent_analyzer_detects_domain_and_purpose():
    analyzer = IntentAnalyzer()
    intent = await analyzer.analyze("창업 관련 입문 책 추천해줘")

    assert intent.domain == "비즈니스"
    assert intent.purpose == "입문"
    assert intent.query_type == "general"


@pytest.mark.asyncio
async def test_intent_analyzer_detects_author_queries():
    analyzer = IntentAnalyzer()
    intent = await analyzer.analyze("김영하 작가의 책을 더 추천해줘")

    assert intent.query_type == "author"
    assert intent.focus_author == "김영하"


@pytest.mark.asyncio
async def test_keyword_expander_returns_synonyms():
    analyzer = IntentAnalyzer()
    intent = await analyzer.analyze("창업 입문서가 필요해")
    expander = KeywordExpander()

    keywords = await expander.expand(intent)

    assert "비즈니스" in keywords
    assert "스타트업" in keywords  # synonym from mapping


@pytest.mark.asyncio
async def test_self_help_request_keeps_domain_keywords_for_hybrid_search():
    intent = await IntentAnalyzer().analyze("동기부여를 얻을 수 있는 자기계발책을 추천해줘")
    keywords = await KeywordExpander().expand(intent)

    assert intent.domain == "자기계발"
    assert "자기계발" in keywords
    assert "동기부여" in keywords


@pytest.mark.asyncio
async def test_healing_novel_keeps_novel_genre_in_embedding_prompt():
    query = "힐링되는 소설을 추천해줘"
    intent = await IntentAnalyzer().analyze(query)
    prompt = PromptTemplateBuilder().build(intent, query)

    assert intent.domain is None
    assert intent.genre == "소설"
    assert intent.tone == "힐링"
    assert intent.query_type == "mood"
    assert "장르: 소설" in prompt
    assert "에세이" not in prompt


@pytest.mark.asyncio
async def test_keyword_expansion_keeps_priority_and_order():
    intent = IntentMetadata(raw_query="힐링되는 소설", genre="소설", tone="힐링")
    expander = KeywordExpander()

    first = await expander.expand(intent)
    second = await expander.expand(intent)

    assert first == second
    assert first[:5] == ["소설", "novel", "fiction", "힐링", "잔잔한"]


@pytest.mark.asyncio
async def test_intent_analyzer_detects_custom_genre():
    analyzer = IntentAnalyzer()
    intent = await analyzer.analyze("정치 소설 관련 책을 추천해줘")

    assert intent.genre == "정치 소설"
    assert "정치 소설" in intent.keywords


@pytest.mark.asyncio
async def test_mood_query_does_not_trigger_author_intent():
    analyzer = IntentAnalyzer()
    intent = await analyzer.analyze("어두운 분위기의 책을 추천해줘")

    assert intent.query_type == "mood"
    assert intent.focus_author is None


def test_prompt_builder_domain_template_includes_constraints():
    builder = PromptTemplateBuilder()
    intent = IntentMetadata(
        raw_query="창업 입문자를 위한 책",
        domain="비즈니스",
        purpose="입문",
        constraints=["최근", "한국"],
    )

    prompt = builder.build(intent, intent.raw_query)

    assert "비즈니스" in prompt
    assert "입문" in prompt
    assert "제약: 최근, 한국" in prompt


@pytest.mark.asyncio
async def test_book_classifier_returns_primary_keyword_and_tags():
    # 테스트에서는 외부 LLM(Gemini) 호출을 막아 재현성을 확보합니다.
    classifier = BookClassifier(llm_tagger=GeminiTagger(api_key=""))

    result = await classifier.classify(
        title="유난한 도전",
        contents="토스의 창업과 스타트업 여정을 다룬 이야기",
        authors="토스팀",
    )

    assert isinstance(result.primary_keyword, str) and result.primary_keyword
    assert isinstance(result.tags, list) and result.tags
    assert isinstance(result.used_llm, bool)
