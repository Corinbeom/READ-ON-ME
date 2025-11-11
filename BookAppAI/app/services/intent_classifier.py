import re
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine, List, Optional


# Type alias for pluggable async LLM hooks. The callable receives the raw query
# and already parsed metadata, and returns a metadata dict to merge.
LLMCallback = Callable[[str, dict], Coroutine[Any, Any, dict]]


@dataclass
class IntentMetadata:
    """Structured representation of a user's natural-language query."""

    raw_query: str
    domain: Optional[str] = None
    genre: Optional[str] = None
    purpose: Optional[str] = None
    tone: Optional[str] = None
    query_type: str = "general"
    focus_author: Optional[str] = None
    constraints: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)

    def merge(self, other: dict) -> None:
        """Merge data coming from an LLM callback into this metadata."""
        for key, value in other.items():
            if not hasattr(self, key):
                continue
            if isinstance(value, list):
                current = getattr(self, key) or []
                combined = list(dict.fromkeys([*current, *value]))
                setattr(self, key, combined)
            elif value:
                setattr(self, key, value)


AUTHOR_PATTERN = re.compile(r"([\w\s·가-힣]+?)\s*(?:작가)?\s*의\s*(?:책|작품|소설)")
AUTHOR_KEYWORDS = ["작가", "저자", "필명"]
AUTHOR_INVALID_TOKENS = {"분위기", "느낌", "감성", "무드", "주제", "테마"}

DOMAIN_KEYWORDS = {
    "창업": "비즈니스",
    "스타트업": "비즈니스",
    "기업": "비즈니스",
    "비즈니스": "비즈니스",
    "재테크": "금융",
    "투자": "금융",
    "주식": "금융",
    "경제": "금융",
    "정치": "정치",
    "힐링": "에세이",
    "회고": "에세이",
    "심리": "심리",
    "철학": "철학",
}

GENRE_KEYWORDS = {
    "sf": "SF",
    "공상 과학": "SF",
    "판타지": "판타지",
    "로맨스": "로맨스",
    "스릴러": "스릴러",
    "추리": "미스터리",
    "에세이": "에세이",
    "논픽션": "논픽션",
    "소설": "소설",
    "정치 소설": "정치 소설",
}

TONE_KEYWORDS = {
    "감성": "감성",
    "따뜻": "힐링",
    "잔잔": "힐링",
    "몰입": "몰입감",
    "긴장": "스릴",
}

PURPOSE_KEYWORDS = {
    "입문": "입문",
    "초보": "입문",
    "기초": "입문",
    "심화": "심화",
    "전문": "전문",
    "실전": "실전",
    "준비": "대비",
}

QUERY_TYPE_KEYWORDS = {
    "author": AUTHOR_KEYWORDS,
    "similar": ["같은", "비슷한"],
    "mood": ["분위기", "느낌", "감성", "무드"],
    "domain": ["관련", "분야", "도메인"],
}

CONSTRAINT_KEYWORDS = ["최근", "신간", "짧은", "두꺼운", "한국", "번역", "입문", "심화"]


class IntentAnalyzer:
    """
    Multi-layer intent detector. Uses lightweight heuristics now, but exposes
    a pluggable LLM callback for downstream upgrades.
    """

    def __init__(self, llm_callback: Optional[LLMCallback] = None):
        self.llm_callback = llm_callback

    async def analyze(self, query: str) -> IntentMetadata:
        normalized = query.strip()
        metadata = self._rule_based_parse(normalized)

        if self.llm_callback:
            try:
                llm_result = await self.llm_callback(query, metadata.__dict__)
                if isinstance(llm_result, dict):
                    metadata.merge(llm_result)
            except Exception as exc:  # pragma: no cover - defensive
                print(f"[IntentAnalyzer] LLM callback failed: {exc}")

        return metadata

    def _rule_based_parse(self, query: str) -> IntentMetadata:
        lower = query.lower()
        domain = self._match_keyword(lower, DOMAIN_KEYWORDS)
        genre = self._match_keyword(lower, GENRE_KEYWORDS) or self._extract_custom_genre(lower)
        tone = self._match_keyword(lower, TONE_KEYWORDS)
        purpose = self._match_keyword(lower, PURPOSE_KEYWORDS)

        constraints = [kw for kw in CONSTRAINT_KEYWORDS if kw in query]
        focus_author = self._extract_author(query)

        query_type = "general"
        if focus_author:
            query_type = "author"
        elif any(token in query for token in QUERY_TYPE_KEYWORDS["similar"]):
            query_type = "similar"
        elif any(token in query for token in QUERY_TYPE_KEYWORDS["mood"]):
            query_type = "mood"

        keywords = []
        if domain:
            keywords.append(domain)
        if genre:
            keywords.append(genre)
        if purpose:
            keywords.append(purpose)
        keywords = list(dict.fromkeys(keywords))

        return IntentMetadata(
            raw_query=query,
            domain=domain,
            genre=genre,
            tone=tone,
            purpose=purpose,
            query_type=query_type,
            focus_author=focus_author,
            constraints=constraints,
            keywords=keywords,
        )

    def _match_keyword(self, text: str, mapping: dict) -> Optional[str]:
        for needle in sorted(mapping.keys(), key=len, reverse=True):
            label = mapping[needle]
            if needle.lower() in text:
                return label
        return None

    def _extract_custom_genre(self, text: str) -> Optional[str]:
        # Capture patterns like "정치 소설", "역사 소설" 등
        if "소설" in text:
            before, _, _ = text.partition("소설")
            tokens = before.strip().split()
            if tokens:
                candidate = tokens[-1]
                if candidate and candidate not in {"관련", "같은"}:
                    return f"{candidate} 소설"
        return None

    def _extract_author(self, query: str) -> Optional[str]:
        match = AUTHOR_PATTERN.search(query)
        if match:
            candidate = match.group(1).strip()
            if any(token in candidate for token in AUTHOR_INVALID_TOKENS):
                return None
            return candidate
        return None
