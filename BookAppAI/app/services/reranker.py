"""
Gemini를 이용한 검색 결과 재순위화.

벡터 검색 Top 20 후보를 Gemini가 읽고
사용자 의도에 가장 적합한 5권을 선별 + 추천 이유를 생성한다.

실패 시 원본 Top 5를 reason 없이 반환 (graceful degradation).
"""

from __future__ import annotations

import os
import logging
from typing import Any, Dict, List

import httpx
from app.services import llm_cooldown

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_BASE = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1")
RERANK_MODEL = os.getenv("GEMINI_DETAILED_MODEL", "gemini-2.5-flash")
RERANK_TIMEOUT = 30.0

RERANK_CANDIDATE_LIMIT = 10   # Gemini에 넘길 후보 수 (프롬프트 크기 제어)
FINAL_RESULT_LIMIT = 5        # 최종 반환 수


def _parse_selection(raw: str, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result = []
    seen_indices: set[int] = set()
    seen_isbns: set[str] = set()
    for line in raw.splitlines():
        number, separator, reason = line.strip().partition("|")
        if not separator:
            continue
        try:
            index = int(number.strip()) - 1
        except ValueError:
            continue
        if not 0 <= index < len(candidates) or index in seen_indices:
            continue
        book = dict(candidates[index])
        isbn = book.get("isbn")
        if isbn and isbn in seen_isbns:
            continue
        book["reason"] = reason.strip()
        result.append(book)
        seen_indices.add(index)
        if isbn:
            seen_isbns.add(isbn)
        if len(result) >= FINAL_RESULT_LIMIT:
            break
    return result


async def rerank_with_gemini(
    query: str,
    candidates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    후보 목록을 Gemini로 재순위화하고 각 결과에 reason 필드를 추가한다.
    실패 시 원본 순서 Top 5 반환 (reason 없음).
    """
    fallback = candidates[:FINAL_RESULT_LIMIT]

    if not GEMINI_API_KEY or not candidates or not llm_cooldown.available():
        return fallback

    top = candidates[:RERANK_CANDIDATE_LIMIT]
    book_list = "\n".join(
        f"{i + 1}. 제목: {c.get('title', '')} / 저자: {c.get('authors', '')} / 설명: {(c.get('contents') or '')[:80]}"
        for i, c in enumerate(top)
    )

    prompt = f"""사용자 검색어: "{query}"

아래 도서 목록 중 검색 의도에 가장 잘 맞는 최대 5권을 골라 순서대로 나열해줘.
학습서·시험 대비 교재·문제집·교과서는 반드시 제외해.
적합한 책이 5권 미만이면 있는 만큼만 반환해.

도서 목록:
{book_list}

반드시 아래 형식으로만 출력해 (한 줄에 하나, 다른 말 없이):
번호|추천이유(50자 이내, 완성된 문장으로)

출력 예시:
2|인간 소외와 실존적 고통을 서정적으로 그린 일본 현대문학의 걸작
5|일상의 균열과 자아 붕괴를 섬세하게 담아낸 에세이"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 600},
    }
    url = f"{GEMINI_API_BASE}/models/{RERANK_MODEL}:generateContent"

    try:
        async with httpx.AsyncClient(timeout=RERANK_TIMEOUT) as client:
            resp = await client.post(url, params={"key": GEMINI_API_KEY}, json=payload)
            resp.raise_for_status()
            raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()

        result = _parse_selection(raw, top)

        if result:
            logger.info("Reranker selected %d books", len(result))
            return result

    except Exception as exc:
        status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
        if status == 429:
            llm_cooldown.rate_limited()
        logger.warning("Reranker fallback error=%s status=%s", type(exc).__name__, status)

    return fallback
