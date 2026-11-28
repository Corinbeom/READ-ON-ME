"""Find fiction and poetry with specific catalog themes and a matching Chungnam edition."""

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import re

from app.services.corpus_quality import preflight_candidate
from holdings import HASHES, HOLD, JUNK, SOURCE, normal, rows, valid_isbn

CHUNGNAM_SHA256 = "db18a5a7791314e91d868a04506c8bbc673cbdee00dca00aaeb52059147ff1a6"

GENRES = {
    "과학소설": r"과학소설|공상과학|에스에프|사이언스픽션|SF",
    "판타지": r"판타지|환상소설|환상동화",
    "추리": r"추리|미스터리|미스테리|탐정",
    "공포·스릴러": r"공포|호러|스릴러",
    "로맨스": r"로맨스|연애소설|사랑소설",
    "역사소설": r"역사소설|역사동화",
    "성장과 우정": r"성장소설|성장동화|우정",
    "스포츠 이야기": r"스포츠|야구|축구|농구|수영",
    "가족 이야기": r"가족소설|가족동화|가족사|가족관계",
    "이주와 정체성 이야기": r"이민|이주민|난민|디아스포라|성소수자|퀴어",
    "사랑시": r"사랑시|연애시|사랑|그리움",
}
THEMES = tuple(
    re.compile(p)
    for p in (
        "로봇|인공지능|안드로이드",
        "우주|외계|행성",
        "미래사회|근미래|디스토피아",
        "시간여행|타임슬립|타임루프",
        "기후|생태|환경오염",
        "재난|종말|멸망",
        "기억|망각",
        "죽음|애도|상실",
        "모험|탐험|여정",
        "꿈|무의식",
        "마법|마술|주술",
        "요괴|귀신|유령|괴물",
        "전설|민담|신화",
        "동물|고양이|강아지|고래|반려견",
        "가족|가정",
        "아버지|아빠|부녀|부자관계",
        "어머니|엄마|모녀|모자관계",
        "형제|자매|남매",
        "세대|노년|할머니|할아버지",
        "우정|친구",
        "첫사랑|짝사랑|연애|사랑",
        "이별|실연|재회",
        "성장|사춘기|청춘",
        "학교생활|학교폭력|따돌림",
        "갈등|화해",
        "용기|두려움",
        "편견|차별|혐오",
        "장애|청각|시각장애",
        "난민|이민|이주|망명",
        "정체성|성소수자|퀴어",
        "독립운동|일제강점기|항일",
        "조선시대|조선왕조|고려시대|삼국시대",
        "전쟁|분단|피난",
        "식민|광주민주화|민주화",
        "수사|경찰|형사",
        "탐정|사립탐정",
        "실종|유괴|납치",
        "비밀|단서|암호",
        "범죄|살인|도둑",
        "야구|축구|농구|수영|마라톤",
        "팀워크|팀원|경쟁|선수",
        "빈곤|가난|불평등",
        "노동|노동자",
        "시골|농촌|도시생활",
        "고독|외로움|소외",
        "자연|계절|풍경",
        "희망|위로|치유",
    )
)
COMPILED = {topic: re.compile(pattern, re.I) for topic, pattern in GENRES.items()}


def select(pangyo, chungnam, excluded_ids, excluded_titles, maximum):
    potential = {}
    for row in rows(pangyo, HASHES[0]):
        isbn, title, authors, raw, kdc = (
            row[k]
            for k in ("도서번호(ISBN)", "도서명", "저자", "키워드", "분류기호(KDC)")
        )
        if (
            isbn in excluded_ids
            or not valid_isbn(isbn)
            or not re.fullmatch(r"8[1-9][13](?:\.\d+)?", kdc)
        ):
            continue
        if (
            not re.search("[가-힣]", title)
            or not re.search("[가-힣]", authors)
            or HOLD.search(title + " " + raw)
            or JUNK.search(title)
        ):
            continue
        base = normal(re.split(r"[:：]", title, maxsplit=1)[0])
        if base in excluded_titles or not base:
            continue
        terms = list(
            dict.fromkeys(
                t
                for t in re.split(r"[ ,;/|·]+", raw)
                if re.fullmatch(r"(?:[가-힣]{2,12}|SF소설|SF)", t, re.I)
            )
        )
        genres = [
            topic
            for topic, pattern in COMPILED.items()
            if pattern.search(" ".join(terms))
            and (topic == "사랑시") == (kdc[2] == "1")
        ]
        if not genres or len(terms) < 4:
            continue
        independent = [t for t in terms if t not in normal(title)]
        concepts = {
            j
            for j, p in enumerate(THEMES)
            if any(p.fullmatch(term) for term in independent)
        }
        if len(concepts) < 2:
            continue
        record = dict(
            title=title,
            authors=authors,
            first=row["등록번호"],
            year=row["발행년도"],
            terms=terms[:12],
            topics=genres,
            concepts=len(concepts),
            base=base,
        )
        prior = potential.get(isbn)
        if prior and (normal(prior["title"]), normal(prior["authors"])) != (
            normal(title),
            normal(authors),
        ):
            prior["conflict"] = True
        elif not prior:
            potential[isbn] = record
    with chungnam.open("rb") as f:
        if hashlib.file_digest(f, "sha256").hexdigest() != CHUNGNAM_SHA256:
            raise ValueError("Unexpected Chungnam catalog revision")
    with chungnam.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            rec = potential.get(row["ISBN"])
            if not rec:
                continue
            if (normal(rec["title"]), normal(rec["authors"])) != (
                normal(row["서명"]),
                normal(row["저자"]),
            ):
                rec["conflict"] = True
            else:
                rec.setdefault("second", row["등록번호"])
    groups = defaultdict(list)
    for isbn, rec in potential.items():
        if rec.get("conflict") or not rec.get("second"):
            continue
        for topic in rec["topics"]:
            groups[topic].append(isbn)
    for group in groups.values():
        group.sort(
            key=lambda i: (
                potential[i]["concepts"],
                hashlib.sha256(i.encode()).digest(),
            )
        )
    chosen = {}
    by_author = Counter()
    works = set(excluded_titles)
    order = sorted(groups, key=lambda k: len(groups[k]))
    while len(chosen) < maximum:
        previous = len(chosen)
        for t in order:
            while groups[t]:
                i = groups[t].pop()
                b = potential[i]
                author = normal(b["authors"])
                if i in chosen or b["base"] in works or by_author[author] >= 2:
                    continue
                chosen[i] = dict(b, topic=t)
                works.add(b["base"])
                by_author[author] += 1
                break
            if len(chosen) >= maximum:
                break
        if len(chosen) == previous:
            break
    return chosen


def make_fields(records):
    fields = []
    for isbn, book in records.items():
        terms = ", ".join(book["terms"])
        if len(terms) < 28 or not COMPILED[book["topic"]].search(terms):
            continue
        values = {
            "title": book["title"],
            "authors": book["authors"],
            "contents": "도서관 주제어: " + terms + ".",
        }
        if preflight_candidate(dict(isbn=isbn, **values)):
            continue
        values["contents"] += "\n\n출처: 성남시 판교도서관 장서목록에 실린 서지 주제어."
        fields.extend(
            dict(
                isbn=isbn,
                field=name,
                value=value,
                provider="SEONGNAM_HOLDINGS_BIB",
                source_ref=SOURCE + "#" + book["first"],
                checked_on="2026-11-28",
                policy_version="2026-11-28",
            )
            for name, value in values.items()
        )
    return fields


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("pangyo", "chungnam", "exclude", "out"):
        parser.add_argument(name, type=Path)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument(
        "--fields", type=Path, help="Write model-eligible, attributed fields"
    )
    args = parser.parse_args()
    existing = json.loads(args.exclude.read_text())
    result = select(
        args.pangyo,
        args.chungnam,
        set(existing["isbns"]),
        set(existing["titles"]),
        args.limit,
    )
    with args.out.open("x") as f:
        json.dump(result, f, ensure_ascii=False)
    print(len(result), dict(Counter(b["topic"] for b in result.values())))
    if args.fields:
        with args.fields.open("x") as f:
            json.dump(make_fields(result), f, ensure_ascii=False)
