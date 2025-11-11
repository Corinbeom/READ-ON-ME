from dataclasses import dataclass
from typing import List, Optional, Tuple

from app.services.gemini_tagger import GeminiTagger
from app.services.intent_classifier import IntentAnalyzer, IntentMetadata


@dataclass
class BookClassification:
    primary_keyword: str
    tags: List[str]
    intent: IntentMetadata
    used_llm: bool = False


class BookClassifier:
    """
    Lightweight book metadata classifier. Currently reuses the IntentAnalyzer
    heuristics but exposes a single entry point so that zero-shot/LLM models can
    be swapped in later without touching the ingestion flow.
    """

    def __init__(
        self,
        intent_analyzer: Optional[IntentAnalyzer] = None,
        llm_tagger: Optional[GeminiTagger] = None,
    ):
        self.intent_analyzer = intent_analyzer or IntentAnalyzer()
        self.llm_tagger = llm_tagger or GeminiTagger()

    async def classify(
        self,
        title: str,
        contents: str,
        authors: str,
    ) -> BookClassification:
        query = self._compose_query(title, contents, authors)
        intent = await self.intent_analyzer.analyze(query)
        primary_keyword, tags, used_llm = await self._llm_or_fallback(intent, title, contents, authors)
        return BookClassification(
            primary_keyword=primary_keyword,
            tags=tags,
            intent=intent,
            used_llm=used_llm,
        )

    async def _llm_or_fallback(
        self,
        intent: IntentMetadata,
        title: str,
        contents: str,
        authors: str,
    ) -> Tuple[str, List[str], bool]:
        llm_primary: Optional[str] = None
        llm_tags: List[str] = []
        if self.llm_tagger and self.llm_tagger.enabled:
            llm_result = await self.llm_tagger.classify_book(title, contents, authors)
            if llm_result:
                llm_primary = llm_result.get("primary_keyword") or None
                tags = llm_result.get("tags") or []
                if isinstance(tags, list):
                    llm_tags = [tag for tag in tags if isinstance(tag, str)]

        if llm_primary:
            return llm_primary, self._dedup_tags(llm_tags), True

        fallback_primary = self._resolve_primary(intent)
        fallback_tags = self._collect_tags(intent)
        return fallback_primary, fallback_tags, False

    def _compose_query(self, title: str, contents: str, authors: str) -> str:
        parts = []
        if title:
            parts.append(f"제목: {title}")
        if authors:
            parts.append(f"저자: {authors}")
        if contents:
            parts.append(f"내용: {contents}")
        return "\n".join(parts)

    def _resolve_primary(self, intent: IntentMetadata) -> str:
        return intent.domain or intent.genre or intent.purpose or "user_added"

    def _collect_tags(self, intent: IntentMetadata) -> List[str]:
        tags = [
            value
            for value in [
                intent.domain,
                intent.genre,
                intent.purpose,
                intent.tone,
                *intent.constraints,
            ]
            if value
        ]
        return self._dedup_tags(tags)

    def _dedup_tags(self, tags: List[str]) -> List[str]:
        seen = set()
        unique: List[str] = []
        for tag in tags:
            if tag in seen:
                continue
            seen.add(tag)
            unique.append(tag)
        return unique
