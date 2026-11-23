"""Canonical Korean labels used before keyword counting and public matching."""
import re
import unicodedata

ALIASES = {
    "mystery": "미스터리", "미스테리": "미스터리", "sf": "과학소설",
    "sf소설": "과학소설", "sf 소설": "과학소설", "science fiction": "과학소설",
    "공상과학소설": "과학소설", "fantasy": "판타지", "romance": "로맨스",
    "thriller": "스릴러", "history": "역사", "family": "가족", "ai": "인공지능",
}


def korean_keyword(value):
    if not isinstance(value, str):
        return None
    label = " ".join(unicodedata.normalize("NFKC", value).split())
    label = ALIASES.get(label.casefold(), label)
    if (len(label) <= 100 and re.search("[가-힣]", label)
            and re.fullmatch(r"[가-힣0-9 ·%,+()/-]+", label)):
        return label
    return None
