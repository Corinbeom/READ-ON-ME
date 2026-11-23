"""Build the offline ISBN index from two pinned Seongnam library workbooks.

Install openpyxl==3.1.5 in a build environment, extract 판교도서관.xlsx and 중앙도서관.xlsx from
https://www.data.go.kr/data/3071094/fileData.do (2026-01-07), then run
python -m tools.build_shelf_catalog 판교도서관.xlsx 중앙도서관.xlsx app/data/seongnam-20260107.sqlite3
from BookAppAI. Runtime uses only the built index and the standard library.
"""
import argparse
import hashlib
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from tempfile import TemporaryDirectory

from openpyxl import load_workbook

SOURCE_SHA = {
    "45918768f3b6d76b562f0e4847c5fc6eb5dd35f7a27c4c11f10dcda64d38692c",  # 판교
    "717b1f435508b238b349a7afd4409dbc5f26c4bc9edb3a1d6771528af7501bd7",  # 중앙
}
# Use complete, standalone subject terms only. Free-form catalog keywords may
# also contain names, title fragments and shelf markers.
SUBJECTS = set("""
가족 우정 사랑 성장 이별 결혼 청춘 죽음 상실 치유 모험 여행 전쟁 평화
추리 미스터리 판타지 스릴러 로맨스 디스토피아 과학소설 역사소설 성장소설
추리소설 우화 체제비판 고전 서양고전 한국소설 일본소설 일본문학 영국소설 미국소설 프랑스소설
독일소설 중국소설 스페인소설 이탈리아소설 시 수필 동시 희곡 전기 자서전 회고록
애도 연대 자유 차별 빈곤 이민 난민 민족주의 민주주의 자본주의 생명윤리
시간관리 자기관리 경영전략 스타트업 조직문화 재무관리 행동경제학 금융시장
사회문제 인권 노동 환경 기후변화 생태 자연 인공지능 우주 과학 기술 수학 물리학
철학 심리학 경제 금융 투자 경영 창업 마케팅 자기계발 습관 인간관계 리더십
음악 미술 건축 디자인 영화 요리 건강 육아 교육 독서 글쓰기 여성 역사 한국사 세계사
""".split())
KDC = {
    "029": "독서", "180": "심리학", "189": "응용심리학", "199": "윤리",
    "325": "경영", "327": "금융", "331": "사회학", "802": "글쓰기",
    "811": "한국시", "813": "한국소설", "814": "한국수필", "823": "중국소설",
    "833": "일본소설", "843": "영미소설", "853": "독일소설", "863": "프랑스소설",
    "873": "스페인소설", "883": "이탈리아소설", "911": "한국사",
}
MAIN_CLASSES = ("총류", "철학", "종교", "사회과학", "자연과학", "기술과학", "예술", "언어", "문학", "역사")


def collect(source, classes, subjects):
    workbook = load_workbook(source, read_only=True, data_only=True)
    try:
        rows = workbook.active.values
        header = next(rows)
        isbn_col, kdc_col, subject_col = (header.index(k) for k in ("도서번호(ISBN)", "분류기호(KDC)", "키워드"))
        for row in rows:
            isbn = str(row[isbn_col]).strip()
            if not re.fullmatch(r"97[89][0-9]{10}", isbn) or sum(
                int(ch) * (1 if i % 2 == 0 else 3) for i, ch in enumerate(isbn)
            ) % 10:
                continue
            code = str(row[kdc_col]).strip()
            if re.fullmatch(r"[0-9]{3}(?:\.[0-9]+)?", code):
                classes[isbn].add(code[:3])
            terms = SUBJECTS.intersection(str(row[subject_col]).split())
            if terms:
                subjects[isbn].update(terms)
    finally:
        workbook.close()


def build(sources, output):
    if {hashlib.sha256(source.read_bytes()).hexdigest() for source in sources} != SOURCE_SHA:
        raise ValueError("Workbooks differ from the reviewed source")
    classes = defaultdict(set)
    subjects = defaultdict(set)
    for source in sources:
        collect(source, classes, subjects)

    def entries():
        for isbn in sorted(classes.keys() | subjects.keys()):
            codes = classes.get(isbn, set())
            tags = subjects.get(isbn, set()).copy()
            if len(codes) == 1:
                code = next(iter(codes))
                if code in KDC:
                    tags.add(KDC[code])
                elif not tags:
                    tags.add(MAIN_CLASSES[int(code[0])])
            if tags:
                yield int(isbn), "|".join(sorted(tags))

    with TemporaryDirectory(dir=output.parent) as tmp:
        stage = Path(tmp) / "index.sqlite3"
        with sqlite3.connect(stage) as db:
            db.execute("CREATE TABLE subjects (isbn INTEGER PRIMARY KEY, tags TEXT NOT NULL)")
            db.executemany("INSERT INTO subjects VALUES (?,?)", entries())
            print(db.execute("SELECT count(*) FROM subjects").fetchone()[0], "ISBNs")
        db.close()
        stage.replace(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbooks", type=Path, nargs=2)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.workbooks, args.output)
