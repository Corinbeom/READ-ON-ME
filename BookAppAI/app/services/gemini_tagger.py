import json
import os
from typing import Any, Dict, List, Optional

import httpx


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_DEFAULT_MODEL = os.getenv("GEMINI_CLASSIFIER_MODEL", "gemini-2.5-flash")
GEMINI_API_BASE = os.getenv(
    "GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1"
)
GEMINI_TIMEOUT = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "20"))

PROMPT_TEMPLATE = """너는 도서 분류 전문가야. 아래 책 정보를 읽고 대표 키워드와 관련 태그를 JSON으로만 출력해.

요구사항:
1. primary_keyword에는 책을 가장 잘 대표하는 도메인/장르/주제를 간결하게 적어.
2. tags에는 도메인, 장르, 분위기, 난이도, 목적 등을 한글/영문 혼용으로 복수 개 작성해.
3. 시험 대비 교재나 학습서는 태그에 포함하지 말고, 그런 콘텐츠면 primary_keyword를 "교육"으로 설정해.

입력 정보:
제목: {title}
저자: {authors}
요약: {contents}

JSON 스키마:
{{
  "primary_keyword": "string",
  "tags": ["string", ...]
}}

오직 JSON만 반환해.
"""


class GeminiTagger:
    """Thin wrapper around Gemini API for book keyword/tag extraction."""

    def __init__(
        self,
        model_name: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
    ):
        self.api_key = api_key or GEMINI_API_KEY
        self.model = model_name or GEMINI_DEFAULT_MODEL
        self.base_url = base_url or GEMINI_API_BASE
        self.timeout = timeout or GEMINI_TIMEOUT
        self.enabled = bool(self.api_key and self.model)

    async def classify_book(
        self, title: str, contents: str, authors: str
    ) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None

        prompt = PROMPT_TEMPLATE.format(
            title=title or "정보 없음",
            authors=authors or "정보 없음",
            contents=self._truncate(contents),
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
            },
        }

        url = f"{self.base_url}/models/{self.model}:generateContent"
        params = {"key": self.api_key}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, params=params, json=payload)
                response.raise_for_status()
                return self._parse_response(response.json())
        except httpx.HTTPError as exc:
            body = exc.response.text if exc.response is not None else "No response body"
            print(f"[GeminiTagger] API call failed: {exc} | Body: {body}")
            return None
        except json.JSONDecodeError as exc:
            print(f"[GeminiTagger] Failed to parse response JSON: {exc}")
            return None

    def _parse_response(self, response_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        candidates = response_data.get("candidates")
        if not candidates:
            return None
        parts: List[Dict[str, Any]] = (
            candidates[0].get("content", {}).get("parts", [])
        )
        if not parts:
            return None
        text = parts[0].get("text", "").strip()
        if not text:
            return None
        cleaned = self._strip_code_fence(text)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            print("[GeminiTagger] Failed to parse JSON response.")
            return None

        primary = parsed.get("primary_keyword")
        tags = parsed.get("tags") or []
        if isinstance(tags, str):
            tags = [tags]
        parsed["primary_keyword"] = primary.strip() if isinstance(primary, str) else ""
        parsed["tags"] = [tag.strip() for tag in tags if isinstance(tag, str)]
        return parsed

    def _strip_code_fence(self, text: str) -> str:
        if text.startswith("```"):
            text = text.strip().strip("```")
            if text.lower().startswith("json"):
                text = text[4:]
        return text.strip()

    def _truncate(self, contents: str, limit: int = 360) -> str:
        if not contents:
            return "정보 없음"
        stripped = contents.strip()
        if len(stripped) <= limit:
            return stripped
        return stripped[: limit - 3] + "..."
