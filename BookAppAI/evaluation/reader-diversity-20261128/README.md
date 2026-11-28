# 갈피 도서 다양성 검증

2026년 11월 28일 OCI에서 확인한 출발점은 검색 가능한 ISBN 176개다. 도서관 원자료의 행 수, 입력 선별을 통과한 판본, 태그와 임베딩이 있는 판본, 운영 검색 가능 판본을 각각 집계한다. 목표는 운영 검색 가능 2,000권이다.

## 자료와 추천 근거

- 국립어린이청소년도서관의 사서추천 CSV는 기존 조사와 같은 원본인지 파일 해시로 확인한다. 제목·대상 독자·추천문 발췌 해시를 원자료에 다시 대조한다. 추천글에 표시한 출처와 추천 대상은 그대로 제공한다. [사서추천 원자료](https://www.data.go.kr/data/15151124/fileData.do)
- 성남시 장서에서는 ISBN 체크섬, 판교·중앙도서관의 서명·저자·발행연도, 구체적인 부제와 주제어를 확인한다. 카드의 도서관 주제어는 해당 장서에 실린 용어다. 주제별로 돌아가며 고르고 같은 저자에게 선택이 몰리지 않게 한다. 원본 두 파일의 해시는 수집 도구에 고정했다. [성남시 장서](https://www.data.go.kr/data/3071094/fileData.do)
- 하버드 Alma의 한국어 인쇄 단행본은 서명·책임표시·ISBN·주제명이 있는 자료에서 선별했다. 충남도서관 장서와 서명·부제·저자가 일치한 판본의 한글 표기를 사용한다. 각 필드에 실제 제공처와 원본 참조를 남긴다. [하버드 서지 공개 조건](https://library.harvard.edu/services-tools/harvard-library-datasets) · [충남도서관 장서](https://www.data.go.kr/data/15119625/fileData.do) · [판본별 필드](harvard-chungnam-fields.json)
- 독자 사례에서 발견한 일부 공백은 사서추천글의 해당 문장을 직접 검토하거나 판본의 구성과 주제를 확인한 뒤 자체 소개를 작성했다. 판본별로 소개 제공처와 확인 자료를 기록했다. [판본 근거](reader-editions.json) · [소개 필드](reader-fields.json)
- 부산 강서구와 평택시 파일에서 끝 여섯 자리가 0으로 표시된 ISBN을 확인했다. 안양시 파일에는 ISBN 열이 없다. 자료별 공개 주소, SHA-256, 조사 건수는 원자료 조사표에서 볼 수 있다. [자료 조사표](source-audit.json)

## 로컬 재현

아래 경로는 BookAppAI 기준이다. 운영 조회로 내보낸 기준 목록과 별도의 검증 DB를 사용한다. 임베딩 모델과 태그 모델은 운영과 같은 버전을 사용한다.

```sh
export PYTHONPATH=.
batch=evaluation/reader-diversity-20261128
python "$batch/prepare_children.py" librarian.csv live.json children.json
python "$batch/holdings.py" 판교도서관.xlsx 중앙도서관.xlsx excluded-isbns.json holdings.json --limit 2000
python "$batch/manifest.py" holdings.json excluded-isbns.json fields.json
psql "$LOCAL_PSQL_URL" -v ON_ERROR_STOP=1 -f "$batch/policies.sql"
python -m tools.reviewed_corpus import fields.json --new-only
python "$batch/index_batch.py" fields.json held.json --tags-only
python "$batch/index_batch.py" fields.json held.json --limit 200
```

입력 검사는 책의 세 필드를 원자료 버전과 허용 용도로 다시 확인한다. 배치 안에서는 요청별 임시 번호로 책을 식별한다. 모델이 돌려준 한글 키워드, 도서 유형과 근거 문장을 판본별로 검증한다. 다른 책 문장이나 출처표시로는 근거 검사를 통과할 수 없다. 통과한 판본만 문서 임베딩을 생성한다. 재실행하면 같은 필드 버전·모델로 끝낸 작업을 재사용한다. 보류 파일에는 ISBN, 입력 버전, 사유를 남긴다.

## 추천 품질과 운영 반영

고정 질문 18개와 가상 작가·수상명 대조 2개를 최종 도서 묶음에서 두 번 실행한다. 각 실행에서 첫 책 적합 13/18 이상, 하나 이상 적합 15/18 이상, 정상 빈 결과 2/2가 운영 반영 기준이다. 번아웃 사례의 추천 이유와 상세 소개도 확인한다.

분야별 질문 45개에는 실제 독자의 상황과 적합 판정 기준이 들어 있다. 기존 현장 질문 10개를 같은 문장으로 다시 실행해 검색 공백의 변화를 확인한다. 도서 수를 늘리는 동안 실시한 중간 실행은 묶음별 점검에만 사용한다. [분야별 질문](questions.json) · [기존 독자 사례](reader-scenarios.json)

로컬 664권일 때 기존 독자 질문에서 첫 팀장 피드백, 공룡 발굴, 사진 구도, 야구팀 성장 이야기 네 사례에 적합한 책이 나왔다. 자서전 쓰기 책을 색인한 뒤에도 가족 기록 질문이 비었다. [664권 중간 실행 결과](reader-results-664.md)
