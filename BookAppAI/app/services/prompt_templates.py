from typing import List

from app.services.intent_classifier import IntentMetadata


DEFAULT_TEMPLATE = (
    "다음 요구사항을 충족하는 책을 추천해줘: {requirements}. "
    "시험 대비 교재나 학습서는 제외하고 문학성과 인사이트가 있는 도서를 우선 제안해."
)

AUTHOR_TEMPLATE = (
    "{author} 작가가 집필한 대표적인 작품과 문학적 분위기가 비슷한 책을 알려줘. "
    "동일 작가의 다른 장르도 함께 고려해."
)

MOOD_TEMPLATE = "독자가 '{tone}' 감성을 느낄 수 있는 책을 소개해줘. {extra}"

SIMILAR_TEMPLATE = (
    "아래 설명과 유사한 주제/분위기의 책을 찾아줘: '{query}'. "
    "학습 교재는 제외하고 서사 중심 작품을 위주로 알려줘."
)

DOMAIN_TEMPLATE = (
    "{domain} 분야에서 {purpose_clause} 독자에게 적합한 책을 추천해줘. "
    "실용성과 실제 사례를 포함하면 좋겠어."
)


class PromptTemplateBuilder:
    """Builds intent-aware embedding prompts."""

    def build(self, intent: IntentMetadata, original_query: str) -> str:
        if intent.query_type == "author" and intent.focus_author:
            return AUTHOR_TEMPLATE.format(author=intent.focus_author)

        if intent.query_type == "mood" and intent.tone:
            constraint_clause = self._constraint_clause(intent)
            extra = f" {constraint_clause}" if constraint_clause else ""
            return MOOD_TEMPLATE.format(tone=intent.tone, extra=extra)

        if intent.query_type == "similar":
            return SIMILAR_TEMPLATE.format(query=original_query.strip())

        if intent.domain:
            purpose_clause = intent.purpose or "관심 있는"
            constraint_clause = self._constraint_clause(intent)
            prompt = DOMAIN_TEMPLATE.format(domain=intent.domain, purpose_clause=purpose_clause)
            return f"{prompt} {constraint_clause}".strip()

        requirements = self._build_requirement_list(intent, original_query)
        return DEFAULT_TEMPLATE.format(requirements="; ".join(requirements))

    def _build_requirement_list(self, intent: IntentMetadata, original_query: str) -> List[str]:
        requirements = [original_query.strip()]
        if intent.genre:
            requirements.append(f"장르: {intent.genre}")
        if intent.tone:
            requirements.append(f"감성: {intent.tone}")
        if intent.purpose:
            requirements.append(f"목적: {intent.purpose}")
        if intent.constraints:
            requirements.append(self._constraint_clause(intent))
        return [req for req in requirements if req]

    def _constraint_clause(self, intent: IntentMetadata) -> str:
        if not intent.constraints:
            return ""
        return f"제약: {', '.join(intent.constraints)}"
