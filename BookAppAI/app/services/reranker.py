"""
Gemini를 이용한 검색 결과 재순위화.

벡터 검색 Top 20 후보를 Gemini가 읽고
사용자 의도에 가장 적합한 5권을 선별 + 추천 이유를 생성한다.

실패 시 원본 Top 5를 reason 없이 반환 (graceful degradation).
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_BASE = os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1")
RERANK_MODEL = os.getenv("GEMINI_DETAILED_MODEL", "gemini-2.5-flash")
RERANK_TIMEOUT = 15.0

RERANK_CANDIDATE_LIMIT = 10   # Gemini에 넘길 후보 수 (프롬프트 크기 제어)
FINAL_RESULT_LIMIT = 5        # 최종 반환 수


async def rerank_with_gemini(
    query: str,
    candidates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    후보 목록을 Gemini로 재순위화하고 각 결과에 reason 필드를 추가한다.
    실패 시 원본 순서 Top 5 반환 (reason 없음).
    """
    fallback = candidates[:FINAL_RESULT_LIMIT]

    if not GEMINI_API_KEY or not candidates:
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
번호|추천이유(30자 이내)

출력 예시:
2|잔잔한 서사와 따뜻한 감성의 힐링 소설
5|일상의 위로를 담은 에세이"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 512},
    }
    url = f"{GEMINI_API_BASE}/models/{RERANK_MODEL}:generateContent"

    try:
        async with httpx.AsyncClient(timeout=RERANK_TIMEOUT) as client:
            resp = await client.post(url, params={"key": GEMINI_API_KEY}, json=payload)
            resp.raise_for_status()
            raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()

        print(f"[Reranker] 원본 응답: {raw!r}")

        result = []
        for line in raw.splitlines():
            line = line.strip()
            if "|" not in line:
                continue
            parts = line.split("|", 1)
            try:
                idx = int(parts[0].strip()) - 1  # 0-based
            except ValueError:
                continue
            if 0 <= idx < len(top):
                book = dict(top[idx])
                book["reason"] = parts[1].strip() if len(parts) > 1 else ""
                result.append(book)
            if len(result) >= FINAL_RESULT_LIMIT:
                break

        if result:
            print(f"[Reranker] '{query}' → {len(result)}권 재순위화 완료")
            return result

    except Exception as exc:
        print(f"[Reranker] 실패, 원본 순서 사용: {exc}")

    return fallback
