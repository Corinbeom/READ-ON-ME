import logging
from typing import Any, Callable, Coroutine, List, Optional

from app.services.intent_classifier import IntentMetadata

logger = logging.getLogger(__name__)


LLMKeywordCallback = Callable[[IntentMetadata], Coroutine[Any, Any, List[str]]]


SYNONYM_MAP = {
    "자기계발": ["자기개발", "동기부여", "성장", "습관", "목표"],
    "비즈니스": ["창업", "스타트업", "기업가정신", "business"],
    "금융": ["재테크", "투자", "finance", "주식"],
    "에세이": ["힐링", "산문", "essay"],
    "심리": ["마음", "정서", "psychology"],
    "철학": ["사유", "철학적", "philosophy"],
    "정치": ["정치학", "politics", "사회"],
    "sf": ["공상과학", "sci-fi", "science fiction"],
    "판타지": ["fantasy", "이세계"],
    "로맨스": ["연애소설", "romance"],
    "스릴러": ["thriller", "서스펜스"],
    "미스터리": ["mystery", "추리"],
    "입문": ["기초", "beginner", "starter"],
    "심화": ["전문", "advanced"],
    "힐링": ["잔잔한", "따뜻한", "comforting"],
    "정치 소설": ["political fiction", "사회풍자 소설"],
    "소설": ["novel", "fiction"],
    "디스토피아": ["dystopia", "디스토피아적", "디스토피아적인"],
}


class KeywordExpander:
    """
    Generates synonym/related keyword lists for hybrid retrieval.
    Can optionally call out to an LLM for richer suggestions.
    """

    def __init__(self, llm_callback: Optional[LLMKeywordCallback] = None):
        self.llm_callback = llm_callback

    async def expand(self, intent: IntentMetadata) -> List[str]:
        seeds = self._collect_seed_terms(intent)
        expanded: List[str] = []
        seen: set[str] = set()

        def add(term: str) -> None:
            normalized = term.strip()
            key = normalized.casefold()
            if key and key not in seen:
                expanded.append(normalized)
                seen.add(key)

        for seed in seeds:
            add(seed)
            mapped = SYNONYM_MAP.get(seed.lower())
            if mapped:
                for term in mapped:
                    add(term)

        if self.llm_callback:
            try:
                llm_terms = await self.llm_callback(intent)
                for term in llm_terms:
                    add(term)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Keyword expansion LLM fallback error=%s", type(exc).__name__)

        return expanded

    def _collect_seed_terms(self, intent: IntentMetadata) -> List[str]:
        seeds: List[str] = []
        seen_lower: set[str] = set()

        for value in [
            intent.genre,
            intent.domain,
            intent.purpose,
            intent.tone,
            *intent.constraints,
        ]:
            if value:
                normalized = value.lower()
                if normalized in seen_lower:
                    continue
                seeds.append(value)
                seen_lower.add(normalized)

        # Allow raw keywords to pass through for downstream usage.
        for keyword in intent.keywords or []:
            normalized = keyword.lower()
            if normalized in seen_lower:
                continue
            seeds.append(keyword)
            seen_lower.add(normalized)

        return seeds
