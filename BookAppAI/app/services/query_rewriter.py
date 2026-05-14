"""
Gemini를 이용한 검색 쿼리 리라이팅.

사용자의 자연어 검색어를 벡터 임베딩에 최적화된
도서 설명문으로 변환해 검색 품질을 높인다.

실패 시 None 반환 → 호출부에서 prompt_builder 출력으로 폴백.
"""

from __future__ import annotations

import os
import time
from typing import Optional

import httpx

from app.services.intent_classifier import IntentMetadata

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_BASE = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1")
REWRITE_MODEL = os.getenv("GEMINI_DETAILED_MODEL", "gemini-2.5-flash")
REWRITE_TIMEOUT = 15.0
REWRITE_CACHE_TTL = 300  # 5분 캐시

_rewrite_cache: dict[str, tuple[Optional[str], float]] = {}


async def rewrite_query(query: str, intent: IntentMetadata) -> Optional[str]:
    """
    검색어를 임베딩용 도서 설명문으로 변환.
    Gemini 실패 시 None 반환.
    """
    if not GEMINI_API_KEY:
        return None

    # 캐시 확인 (동일 쿼리 반복 시 Gemini 재호출 차단)
    cached_value, cached_at = _rewrite_cache.get(query, (None, 0.0))
    if time.time() - cached_at < REWRITE_CACHE_TTL:
        return cached_value

    intent_parts = []
    if intent.genre:        intent_parts.append(f"장르: {intent.genre}")
    if intent.domain:       intent_parts.append(f"분야: {intent.domain}")
    if intent.tone:         intent_parts.append(f"분위기: {intent.tone}")
    if intent.purpose:      intent_parts.append(f"목적: {intent.purpose}")
    if intent.focus_author: intent_parts.append(f"저자: {intent.focus_author}")
    intent_str = " / ".join(intent_parts) if intent_parts else "없음"

    prompt = f"""사용자 도서 검색 쿼리: "{query}"
파악된 의도: {intent_str}

이 검색 의도를 벡터 임베딩 검색에 최적화된 도서 설명문으로 변환해줘.
조건:
- 장르·분위기·주제·독자층을 명확히 포함
- 학습서·시험 대비 교재 제외
- 2~3문장, 한국어
- 설명문만 출력 (다른 말 없이)"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 150},
    }
    url = f"{GEMINI_API_BASE}/models/{REWRITE_MODEL}:generateContent"

    try:
        async with httpx.AsyncClient(timeout=REWRITE_TIMEOUT) as client:
            resp = await client.post(url, params={"key": GEMINI_API_KEY}, json=payload)
            if resp.status_code == 429:
                print("[QueryRewriter] Rate limit — 템플릿 폴백")
                return None
            resp.raise_for_status()
            text = (
                resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            )
            if text:
                print(f"[QueryRewriter] '{query}' → '{text[:80]}...'")
                _rewrite_cache[query] = (text, time.time())
                return text
    except Exception as exc:
        print(f"[QueryRewriter] 실패, 템플릿 폴백: {exc}")

    _rewrite_cache[query] = (None, time.time())  # 실패도 캐시 (429 반복 방지)
    return None
