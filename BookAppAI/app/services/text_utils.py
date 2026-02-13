from __future__ import annotations

from typing import List, Optional, Union

# Terms that almost always indicate 학습/문제집 계열 도서.
EXCLUSION_STRICT_TERMS = [
    "수능",
    "모의고사",
    "기출",
    "시험대비",
    "정답지",
    "정답 해설",
    "족보",
    "워크북",
    "교재",
    "문제집",
    "단원평가",
    "자이스토리",
    "내신",
]

EXCLUSION_COMBO_LEADS = [
    "중학",
    "중학교",
    "초등",
    "초등학교",
    "고등",
    "고등학교",
    "중등",
    "국어",
    "수학",
    "사회",
    "과학",
]

EXCLUSION_COMBO_TRAILERS = [
    "문제집",
    "독해",
    "교과서",
    "자습서",
    "기출",
    "모의고사",
    "수능",
    "내신",
    "평가",
    "학년",
]

# Optional human crafted prompts for 더 풍부한 키워드 표현.
KEYWORD_PROMPTS = {
    "sf": "이 책은 공상 과학 소설(SF) 장르에 속하며 미래 기술과 상상력을 다룹니다.",
    "fantasy": "이 책은 판타지 세계관을 배경으로 한 소설입니다. 마법과 모험이 가득합니다.",
    "romance": "이 책은 사랑과 관계를 중심으로 한 로맨스 소설입니다.",
    "thriller": "이 책은 긴장감 넘치는 전개가 특징인 스릴러 장르 소설입니다.",
}

DEFAULT_PROMPT_TEMPLATE = (
    "이 책은 '{keyword}' 주제와 깊이 관련된 도서입니다. 독자에게 {keyword}에 대한 통찰과 경험을 제공합니다."
)


def _normalize_text(text: Optional[str]) -> str:
    return (text or "").strip()


def format_authors(authors: Optional[Union[List[str], str]]) -> str:
    if isinstance(authors, list):
        return ", ".join(a for a in authors if a)
    return _normalize_text(authors)


def build_keyword_prompt(keyword: str) -> str:
    normalized = _normalize_text(keyword)
    if not normalized:
        return "이 책은 다양한 주제를 다루는 도서입니다."
    prompt = KEYWORD_PROMPTS.get(normalized.lower())
    if prompt:
        return prompt
    return DEFAULT_PROMPT_TEMPLATE.format(keyword=normalized)


def contains_exclusion_terms(*chunks: str) -> bool:
    target_text = " ".join(_normalize_text(chunk).lower() for chunk in chunks if chunk is not None)
    if any(term in target_text for term in EXCLUSION_STRICT_TERMS):
        return True
    if any(lead in target_text for lead in EXCLUSION_COMBO_LEADS) and any(
        trailer in target_text for trailer in EXCLUSION_COMBO_TRAILERS
    ):
        return True
    return False


def should_skip_book(keyword: str, book: dict) -> bool:
    """
    Heuristic gate to ignore 명백한 학습/문제집 도서 등.
    """
    title = book.get("title", "")
    contents = book.get("contents", "")
    authors = format_authors(book.get("authors"))

    if contains_exclusion_terms(title, contents):
        return True

    # Kakao API에서 가끔 제목만 있고 다른 정보가 비어있는 자료는 노이즈인 경우가 많다.
    if not _normalize_text(contents) and not authors:
        return True

    return False


def build_book_text(title: str, contents: str, authors: Optional[Union[List[str], str]]) -> str:
    author_text = format_authors(authors)
    base = f"이 책은 {author_text} 작가가 쓴 책입니다." if author_text else "이 책은 다양한 작가의 관점을 담고 있습니다."
    return f"{base} 제목: {title}. 내용: {contents or '이 책에 대한 상세 설명은 제공되지 않았습니다.'}"








