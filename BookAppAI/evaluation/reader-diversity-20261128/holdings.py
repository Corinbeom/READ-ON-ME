"""Select Korean editions with a descriptive subtitle, subjects and two matching holdings."""

import argparse
from collections import Counter, defaultdict, deque
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from xml.etree import ElementTree as ET
from zipfile import ZipFile

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
HASHES = (
    "45918768f3b6d76b562f0e4847c5fc6eb5dd35f7a27c4c11f10dcda64d38692c",
    "717b1f435508b238b349a7afd4409dbc5f26c4bc9edb3a1d6771528af7501bd7",
)
TOPICS = json.loads(Path(__file__).with_name("topics.json").read_text())
PATTERNS = {k: re.compile(v) for k, v in TOPICS.items()}
SOURCE = "https://www.data.go.kr/data/3071094/fileData.do"
HOLD = re.compile(
    r"문제집|수험서|기출|수능|공무원 시험|모의고사|수험생|워크북|대비서|자격증|문제은행|학술대회|심포지엄|학위논문|학습만화|전집|전권|세트|큰글자|큰글씨|점자|보급판|오디오북|전자책|수류탄|총포|총기|화기|사격|병기|포병|무기|저격|폭발물|해킹|침투테스트|악성코드|바이러스 배양|병원체|유전자 조작|실험 매뉴얼|배양 실습",
    re.I,
)
JUNK = re.compile(
    r"베스트셀러|추천도서|추천 책|필독서|개정판|개정증보|[<>]|https?://|ISBN", re.I
)


def normal(s):
    return "".join(
        c for c in unicodedata.normalize("NFKC", s).casefold() if c.isalnum()
    )


def rows(path, expected):
    with path.open("rb") as f:
        if hashlib.file_digest(f, "sha256").hexdigest() != expected:
            raise ValueError("Unexpected workbook revision")
    with ZipFile(path) as z:
        pool = []
        with z.open("xl/sharedStrings.xml") as f:
            events = ET.iterparse(f, events=("start", "end"))
            _, root = next(events)
            for event, el in events:
                if event == "end" and el.tag == NS + "si":
                    pool.append("".join(x.text or "" for x in el.iter(NS + "t")))
                    root.clear()
        with z.open("xl/worksheets/sheet1.xml") as f:
            events = ET.iterparse(f, events=("start", "end"))
            for event, el in events:
                if event == "start" and el.tag == NS + "sheetData":
                    sheet = el
                if event != "end" or el.tag != NS + "row":
                    continue
                row = {}
                for c in el.iter(NS + "c"):
                    val = c.findtext(NS + "v", default="")
                    if c.get("t") == "s" and val:
                        val = pool[int(val)]
                    elif c.get("t") == "inlineStr":
                        val = "".join(x.text or "" for x in c.iter(NS + "t"))
                    row[re.sub(r"\d", "", c.get("r"))] = val.strip()
                if el.get("r") == "1":
                    header = row
                else:
                    yield {label: row.get(col, "") for col, label in header.items()}
                sheet.clear()


def identity(r):
    return (normal(r["도서명"]), normal(r["저자"]), r["발행년도"])


def valid_isbn(s):
    return (
        re.fullmatch(r"97[89]\d{10}", s)
        and not s.endswith("000000")
        and sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(s)) % 10 == 0
    )


def select(pangyo, central, exclude, limit):
    candidates, conflicts = {}, set()
    for r in rows(pangyo, HASHES[0]):
        isbn, title, authors, tags = (
            r[k] for k in ("도서번호(ISBN)", "도서명", "저자", "키워드")
        )
        if isbn in exclude or not valid_isbn(isbn):
            continue
        if isbn in candidates:
            if identity(r) != candidates[isbn]["identity"]:
                conflicts.add(isbn)
            continue
        if not re.fullmatch(r"(19[89]\d|20[012]\d)", r["발행년도"]) or not re.search(
            "[가-힣]", authors
        ):
            continue
        title = " ".join(title.split())
        split = re.split(r"\s*[:：]\s*", title, maxsplit=1)
        if (
            len(split) != 2
            or len(re.findall("[가-힣]", split[1])) < 12
            or len(title) > 135
        ):
            continue
        if (
            HOLD.search(title + " " + tags)
            or JUNK.search(title)
            or re.search(r"\d+\s*권|\.\s*\d+(\s|$)", title)
        ):
            continue
        terms = list(
            dict.fromkeys(
                t
                for t in tags.split()
                if re.fullmatch(r"[가-힣]{2,12}", t) and not JUNK.search(t)
            )
        )
        extra = [t for t in terms if t not in normal(title)]
        topics = [k for k, pat in PATTERNS.items() if pat.search(" ".join(terms))]
        if not topics or len(extra) < 2 or len(terms) < 3 or len(normal(split[0])) < 2:
            continue
        candidates[isbn] = dict(
            identity=identity(r),
            title=title,
            authors=authors,
            subtitle=split[1],
            terms=terms[:8],
            topics=topics,
            first=r["등록번호"],
            year=r["발행년도"],
        )
    for r in rows(central, HASHES[1]):
        isbn = r["도서번호(ISBN)"]
        if isbn not in candidates:
            continue
        item = candidates[isbn]
        if item["identity"] != identity(r):
            conflicts.add(isbn)
        else:
            item["second"] = r["등록번호"]
    groups = defaultdict(list)
    for isbn, item in candidates.items():
        if isbn in conflicts or not item.get("second"):
            continue
        for topic in item["topics"]:
            groups[topic].append(isbn)
    sizes = {t: len(g) for t, g in groups.items()}
    order = sorted(groups, key=lambda t: (len(groups[t]), t))
    queues = {
        t: deque(sorted(groups[t], key=lambda i: hashlib.sha256(i.encode()).digest()))
        for t in groups
    }
    picked = {}
    works = set()
    author_count = Counter()
    while len(picked) < limit:
        previous = len(picked)
        for topic in order:
            while queues[topic]:
                isbn = queues[topic].popleft()
                item = candidates[isbn]
                work = normal(item["title"].split(":")[0])
                if (
                    isbn in picked
                    or work in works
                    or author_count[item["identity"][1]] >= 3
                ):
                    continue
                works.add(work)
                author_count[item["identity"][1]] += 1
                picked[isbn] = {**item, "topic": topic}
                break
            if len(picked) >= limit:
                break
        if previous == len(picked):
            break
    return picked, sizes


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pangyo", type=Path)
    parser.add_argument("central", type=Path)
    parser.add_argument("exclude", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--limit", type=int, default=1900)
    args = parser.parse_args()
    selected, sizes = select(
        args.pangyo, args.central, set(json.loads(args.exclude.read_text())), args.limit
    )
    with args.out.open("x") as f:
        json.dump(selected, f, ensure_ascii=False)
    print(len(selected), len(sizes), sizes, flush=True)
