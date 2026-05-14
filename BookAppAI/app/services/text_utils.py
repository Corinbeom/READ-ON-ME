from __future__ import annotations

from typing import List, Optional, Union

# ---------------------------------------------------------------------------
# 장르 키워드 → 카카오 검색 프록시 용어 매핑
# 카카오 Book API는 장르 필터를 지원하지 않으므로 더 구체적인 검색어로 대체.
# 예: "문학" → ["한국문학 추천", "세계문학전집", ...] (수능문학 노이즈 감소)
# ---------------------------------------------------------------------------
GENRE_SEED_MAPPING: dict[str, list[str]] = {
    # 소설 계열
    "소설":     ["한국소설", "세계문학전집", "현대소설", "장편소설"],
    "문학":     ["세계문학전집", "고전소설", "현대문학"],
    "sf":       ["SF소설", "SF문학"],
    "판타지":   ["판타지", "로맨스판타지", "이세계"],
    "로맨스":   ["로맨스소설", "연애소설"],
    "스릴러":   ["스릴러소설", "범죄소설"],
    "미스터리": ["미스터리소설", "추리소설"],
    "역사소설": ["역사소설", "시대소설"],
    # 비문학 계열
    "자기계발": ["자기계발서", "습관", "동기부여"],
    "경제경영": ["경제경영", "투자", "비즈니스"],
    "인문학":   ["인문학", "철학", "역사교양"],
    "심리학":   ["심리학", "심리학베스트"],
    "과학":     ["과학교양서", "과학책"],
    "에세이":   ["에세이", "산문집"],
    "사회":     ["사회학", "정치", "사회이슈"],
}

# 장르 키워드별 허용 primary_keyword 집합 (Gemini 분류 결과 검증용).
# Gemini가 이 집합 밖의 키워드를 반환하면 해당 도서는 장르 불일치로 제외.
GENRE_VALIDATION_GROUPS: dict[str, set[str]] = {
    "소설":     {"소설", "문학", "sf", "판타지", "로맨스", "스릴러", "미스터리", "역사소설", "현대소설"},
    "문학":     {"소설", "문학", "시", "에세이", "고전"},
    "sf":       {"sf", "소설", "판타지"},
    "판타지":   {"판타지", "소설", "sf"},
    "로맨스":   {"로맨스", "소설"},
    "스릴러":   {"스릴러", "소설", "추리", "범죄", "미스터리"},
    "미스터리": {"미스터리", "스릴러", "추리", "범죄", "소설"},
    "역사소설": {"역사소설", "소설", "문학"},
    "자기계발": {"자기계발", "비즈니스", "리더십", "경제경영", "성공", "생산성", "심리학"},
    "경제경영": {"경제경영", "투자", "비즈니스", "재테크", "경제", "경영", "자기계발"},
    "인문학":   {"인문학", "철학", "역사", "사회", "문화", "교양"},
    "심리학":   {"심리학", "정신건강", "자기계발", "인문학"},
    "과학":     {"과학", "자연과학", "교양과학"},
    "에세이":   {"에세이", "산문", "수필", "문학"},
    "사회":     {"사회", "정치", "사회과학", "인문학"},
}


def get_proxy_search_terms(keyword: str) -> list[str]:
    """
    장르 키워드를 카카오 검색에 효과적인 프록시 검색어 목록으로 변환.
    매핑이 없으면 원본 키워드 그대로 반환.
    """
    normalized = _normalize_text(keyword).lower()
    return GENRE_SEED_MAPPING.get(normalized) or GENRE_SEED_MAPPING.get(keyword) or [keyword]


def is_genre_match(target_keyword: str, primary_keyword: Optional[str]) -> bool:
    """
    Gemini 분류 결과(primary_keyword)가 target_keyword 장르 그룹에 속하는지 확인.
    검증 그룹이 없는 키워드는 True를 반환(관대하게 허용).
    """
    if not primary_keyword:
        return True
    normalized_target = _normalize_text(target_keyword).lower()
    validation_group = (
        GENRE_VALIDATION_GROUPS.get(normalized_target)
        or GENRE_VALIDATION_GROUPS.get(target_keyword)
    )
    if not validation_group:
        return True
    return primary_keyword.lower() in validation_group


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
    "교과연계",
    "대학입시",
    "언어영역",
    "풀지오",
    "꼭 출제되는",
    "실전문제",
    "입시에",
    "토론해봅시다",
    "기초연구",
    "기초 연구",
    "연구총서",
    "학술총서",
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
    "세트",       # "중등 역사소설 세트" 류 학습 패키지
    "필독서",     # "중등 필독서" 등 교육과정 연계 묶음
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

    # 설명이 30자 미만이면 제목만으로 임베딩 → 품질 낮아 스킵
    if len(_normalize_text(contents)) < 30:
        return True

    return False


def build_book_text(title: str, contents: str, authors: Optional[Union[List[str], str]]) -> str:
    author_text = format_authors(authors)
    base = f"이 책은 {author_text} 작가가 쓴 책입니다." if author_text else "이 책은 다양한 작가의 관점을 담고 있습니다."
    return f"{base} 제목: {title}. 내용: {contents or '이 책에 대한 상세 설명은 제공되지 않았습니다.'}"









