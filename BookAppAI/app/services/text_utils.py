from __future__ import annotations

import re
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
    "임용시험",
    "임용고시",
    "교원임용",
    "ncs",
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
    "학습전략 프로그램",
    "학습 내용 체계적으로",
    "필수 영단어",
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

DAILY_READING_DRILL_TITLE = re.compile(r"(?<!\d)1일\s*1독해")

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
    normalized = [_normalize_text(chunk).lower() for chunk in chunks if chunk is not None]
    target_text = " ".join(normalized)
    if any(term in target_text for term in EXCLUSION_STRICT_TERMS):
        return True
    # Broad lead/trailer combinations are meaningful in a title, but ordinary
    # descriptions can mention both words about an unrelated literary work.
    title_text = normalized[0] if normalized else ""
    if DAILY_READING_DRILL_TITLE.search(title_text):
        return True
    if any(lead in title_text for lead in EXCLUSION_COMBO_LEADS) and any(
        trailer in title_text for trailer in EXCLUSION_COMBO_TRAILERS
    ):
        return True
    return False


DOMAIN_EVIDENCE: dict[str, tuple[str, ...]] = {
    "비즈니스": ("창업", "스타트업", "사업", "비즈니스", "기업", "경영", "사장", "마케팅", "브랜드"),
    "금융": ("경제", "금융", "투자", "재테크", "주식", "증권", "etf", "부동산", "자산", "재무"),
    "심리": ("심리", "마음", "정신", "감정", "인지", "상담", "치료", "우울"),
    "철학": ("철학", "사유", "존재", "윤리", "인문", "사상"),
    "정치": ("정치", "민주주의", "국회", "정권", "정부", "대통령", "선거", "의회", "전체주의", "권력"),
    "에세이": ("에세이", "산문", "수필", "회고", "일기"),
}

FICTION_LABELS = {
    "소설", "문학", "sf", "판타지", "로맨스", "스릴러", "미스터리", "추리",
    "디스토피아", "정치 소설", "정치소설", "우화",
}
NONFICTION_LABELS = {
    "논픽션", "회고록", "전기", "역사", "과학", "사회", "인문학", "경제",
    "금융", "정치", "철학", "심리", "심리학", "비즈니스", "자기계발",
}
NONSTORY_PRIMARY_LABELS = NONFICTION_LABELS | {"에세이", "시", "시집"}
STORY_LABELS = (FICTION_LABELS - {"문학"}) | {"그림책", "동화", "휴먼 드라마"}
NARROW_GENRE_EVIDENCE: dict[str, tuple[str, ...]] = {
    "sf": ("sf", "공상과학", "과학소설", "과학 소설", "사이언스 픽션"),
    "판타지": ("판타지", "마법", "이세계", "환상 세계"),
    "로맨스": ("로맨스", "연애", "연인", "사랑 이야기", "사랑에 빠", "할리퀸"),
    "스릴러": ("스릴러", "서스펜스", "연쇄살인", "추적", "범죄 소설"),
    "미스터리": ("미스터리", "추리", "탐정", "수사", "살인사건"),
    "디스토피아": ("디스토피아", "전체주의", "감시 사회", "감시사회", "통제 사회"),
}
GENRE_ABOUT_TITLE = re.compile(
    r"(?:소설|문학|에세이|판타지|로맨스|sf).{0,14}"
    r"(?:읽기|쓰기|작법|글쓰기|비평|연구|가이드|마스터플랜|이론|분석|역사|탄생|상상력|무엇인가|어떻게|시대정신|전회|사변|도감)",
    re.IGNORECASE,
)
STUDY_OR_COLLECTION_TITLE = re.compile(
    r"(?:정보관리사|자격증|학습전략 프로그램|필독서 세트|작법서|작가 마스터플랜|장르 글쓰기|아이템 도감)",
    re.IGNORECASE,
)
MULTI_BOOK_SET_TITLE = re.compile(r"(?<!마인드)세트|(?:전|총)\s*\d+\s*권")
SCHOOL_ANTHOLOGY_TITLE = re.compile(r"단편소설\s*\d+|중장편소설\s*베스트|선집|모음집|앤솔로지", re.IGNORECASE)
SCHOOL_ANTHOLOGY_CONTEXT = re.compile(r"중고생|학교\s*현장|문학\s*교과서|문학\s*필독서|수업용", re.IGNORECASE)
SCHOOL_ANTHOLOGY_FORM = re.compile(r"모음집|선집|작품.{0,12}수록|작품.{0,12}엮", re.IGNORECASE)
NEW_FICTION_OR_POETRY = re.compile(
    r"(?:첫|신작|새로운|[두세네다섯여섯일곱여덟아홉열0-9]+\s*번째).{0,8}"
    r"(?:장편소설|단편소설|소설집|시집)",
    re.IGNORECASE,
)
GENRE_META_INTRO = ("평론집", "비평서", "개론서", "작법서", "연구서", "작품 분석", "연구 및 감상을 정리")

PRACTICAL_TITLE_TERMS = (
    "대화법", "사용법", "활용법", "실무", "워크북", "가이드", "입문서", "입문", "교과서",
    "매뉴얼", "노하우", "작법", "비법", "자기계발기술", "기획세트", "필사", "지도서",
)
NARRATIVE_INTRO_TERMS = ("장편소설", "단편소설", "소설집", "동화", "회고록", "자전적", "실화", "주인공", "서사")
FICTION_EVIDENCE_TERMS = ("소설", "단편", "장편", "서사", "주인공", "모험", "세계관", "캐릭터")
PRACTICAL_INTRO_TERMS = (
    "자기계발서", "실용서", "대화법", "방법을 소개", "방법을 알려", "방법을 제시",
    "단계별", "상황별", "실전 가이드", "안내서", "활용법", "노하우", "워크북", "실무서", "입문서",
    "예비창업자", "창업을 준비하는 학생",
)


def infer_book_form(title: str, contents: str) -> str:
    """분명한 형식 신호만 사용한다. 불명확한 책은 재정렬 단계에 남긴다."""
    title_text = title.casefold()
    intro = contents[:500].casefold()
    if _has_any(title_text, PRACTICAL_TITLE_TERMS):
        return "PRACTICAL"
    if _has_any(intro, NARRATIVE_INTRO_TERMS):
        return "STORY"
    if _has_any(intro, PRACTICAL_INTRO_TERMS):
        return "PRACTICAL"
    return "UNKNOWN"


def has_fiction_evidence(book: dict) -> bool:
    """Require a work-level narrative cue before using an UNKNOWN book as fiction fallback."""
    text = f"{book.get('title') or ''} {(book.get('contents') or '')[:500]}".casefold()
    return _has_any(text, FICTION_EVIDENCE_TERMS)


def has_korean_fiction_evidence(book: dict) -> bool:
    """Use explicit corpus labels or description evidence; names and publishers prove nothing."""
    labels = [book.get("keyword"), *(book.get("tags") if isinstance(book.get("tags"), list) else [])]
    if any(isinstance(label, str) and label.casefold() in {"한국", "한국소설", "국내소설"} for label in labels):
        return True
    intro = (book.get("contents") or "")[:500].casefold()
    return _has_any(intro, (
        "한국소설", "한국 소설", "한국문학", "한국 문학", "한국 작가", "한국 여성 작가",
        "국내 소설", "국내 작가", "국내 여성 작가",
    ))


def is_school_anthology(book: dict) -> bool:
    """Flag school-oriented collections for ranking, without removing them."""
    title = str(book.get("title") or "")
    intro = str(book.get("contents") or "")[:500]
    return bool(
        SCHOOL_ANTHOLOGY_CONTEXT.search(f"{title} {intro}")
        and (SCHOOL_ANTHOLOGY_TITLE.search(title) or SCHOOL_ANTHOLOGY_FORM.search(intro))
    )


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def _genre_matches(genre: str, title: str, contents: str, labels: list[str]) -> bool:
    genre = genre.casefold()
    title = title.casefold()
    intro = contents[:500].casefold()
    evidence = f"{title} {intro}"
    label_set = {label.casefold() for label in labels}

    if GENRE_ABOUT_TITLE.search(title) or STUDY_OR_COLLECTION_TITLE.search(title):
        return False
    if genre in {"sf", "판타지", "로맨스", "스릴러", "미스터리", "디스토피아", "소설"}:
        if _has_any(intro[:180], GENRE_META_INTRO):
            return False
    if genre == "sf" and "세계추리 sf문학" in title:
        return False
    if genre == "에세이":
        if NEW_FICTION_OR_POETRY.search(intro):
            return False
        return bool(label_set & {"에세이", "산문", "수필", "회고록"}) or _has_any(evidence, ("에세이", "산문", "수필", "회고록"))
    if genre == "논픽션":
        if label_set & (FICTION_LABELS - {"문학"}) or _has_any(evidence, ("장편소설", "단편소설", "소설집", "판타지 소설")):
            return False
        return bool(label_set & NONFICTION_LABELS) or _has_any(evidence, ("논픽션", "실화", "회고록", "전기"))

    fiction_evidence = bool(label_set & FICTION_LABELS) or _has_any(evidence, ("소설", "서사", "단편", "장편", "우화"))
    if "시집" in intro and not _has_any(evidence, ("장편소설", "단편소설", "소설집")):
        return False
    if genre == "소설":
        return fiction_evidence
    if genre == "정치 소설":
        political_labels = {"정치 소설", "정치소설", "전체주의", "사회 비판"}
        return fiction_evidence and (
            _has_any(evidence, DOMAIN_EVIDENCE["정치"]) or bool(label_set & political_labels)
        )
    if genre in NARROW_GENRE_EVIDENCE:
        if genre == "로맨스" and _has_any(evidence, ("로맨스 스캠", "로맨스 사기")):
            return False
        if genre == "스릴러" and "힐링" in label_set and _has_any(intro, ("따뜻", "유머러스")):
            return False
        if genre == "로맨스":
            # A stray romance tag on psychology or fraud books is not a novel.
            independent_fiction = bool(label_set & {"소설", "문학", "판타지", "스릴러", "미스터리", "우화"}) or _has_any(
                evidence, ("소설", "단편", "장편", "주인공")
            )
            return independent_fiction and _has_any(evidence, NARROW_GENRE_EVIDENCE[genre])
        return fiction_evidence and (
            _has_any(evidence, NARROW_GENRE_EVIDENCE[genre]) or genre in label_set
        )
    if genre.endswith(" 소설"):
        return fiction_evidence and genre[:-3].strip() in evidence
    return genre in evidence


def is_search_candidate(
    book: dict, genre: Optional[str] = None, domain: Optional[str] = None,
    requested_form: str = "ANY", constraints: Optional[list[str]] = None,
) -> bool:
    title = book.get("title") or ""
    contents = book.get("contents") or ""
    authors = format_authors(book.get("authors"))
    if MULTI_BOOK_SET_TITLE.search(title):
        return False
    if contains_exclusion_terms(title, contents, authors) or len(contents.strip()) < 30:
        return False
    form = infer_book_form(title, contents)
    if requested_form == "STORY" and (
        GENRE_ABOUT_TITLE.search(title) or STUDY_OR_COLLECTION_TITLE.search(title)
        or _has_any(contents[:180].casefold(), GENRE_META_INTRO)
    ):
        return False
    if requested_form == "STORY" and form == "PRACTICAL":
        return False
    if requested_form == "STORY" and form != "STORY" and (
        "시집" in title or "시집" in contents[:180] or "에세이" in contents[:180]
    ):
        return False
    if requested_form == "PRACTICAL" and form == "STORY":
        return False

    tags = book.get("tags")
    labels = [book.get("keyword"), *(tags if isinstance(tags, list) else [])]
    labels = [label for label in labels if isinstance(label, str) and label and label != "user_added"]
    if requested_form == "STORY" and form == "UNKNOWN":
        if (book.get("keyword") or "").casefold() in NONSTORY_PRIMARY_LABELS:
            return False
        if not {label.casefold() for label in labels} & STORY_LABELS:
            return False
    if genre:
        if genre == "소설" and "필사" in title:
            return False
        if not _genre_matches(genre, title, contents, labels):
            return False
    korean_fiction_request = bool(
        genre and (genre.casefold() == "소설" or genre.casefold() in NARROW_GENRE_EVIDENCE
                   or genre.endswith(" 소설"))
    )
    if korean_fiction_request and constraints and "한국" in constraints and not has_korean_fiction_evidence(book):
        return False
    if domain and ("시집" in labels or "시집" in contents[:500]) and genre != "시":
        return False
    if domain in DOMAIN_EVIDENCE:
        topic_text = f"{title} {contents[:500]}".casefold()
        if not _has_any(topic_text, DOMAIN_EVIDENCE[domain]):
            return False
        if domain == "정치" and not (
            _has_any(title.casefold(), DOMAIN_EVIDENCE["정치"])
            or any(label.casefold() in {"정치", "정치 소설", "정치소설", "전체주의"} for label in labels)
            or sum(term in topic_text for term in DOMAIN_EVIDENCE["정치"]) >= 2
        ):
            return False
    if domain == "자기계발":
        if any(term in contents for term in ("이론서", "이론적 기초", "내용을 학습할 수 있습니다")):
            return False
        relevance_text = " ".join([title, contents, *labels]).lower()
        if not any(term in relevance_text for term in ("자기계발", "자기개발", "동기부여", "습관", "목표", "성장", "성공", "변화")):
            return False
    return True


def should_skip_book(keyword: str, book: dict) -> bool:
    """
    Heuristic gate to ignore 명백한 학습/문제집 도서 등.
    """
    title = book.get("title", "")
    contents = book.get("contents", "")
    authors = format_authors(book.get("authors"))

    if contains_exclusion_terms(title, contents):
        return True

    normalized_contents = _normalize_text(contents)
    if not normalized_contents:
        return True

    # 짧은 소개글은 제목과 저자가 있을 때만 도서 식별 정보로 보완한다.
    if len(normalized_contents) < 30 and (not _normalize_text(title) or not authors):
        return True

    return False


def build_book_text(title: str, contents: str, authors: Optional[Union[List[str], str]]) -> str:
    author_text = format_authors(authors)
    base = f"이 책은 {author_text} 작가가 쓴 책입니다." if author_text else "이 책은 다양한 작가의 관점을 담고 있습니다."
    return f"{base} 제목: {title}. 내용: {contents or '이 책에 대한 상세 설명은 제공되지 않았습니다.'}"









