# 갈피 데이터 전환

## 배포 순서

긴급 차단을 먼저 배포한다. 기존 큐와 도서의 embedded 값은 보존된다. 갈피 점검 상태에서도 일반 검색, 서재 담기, 리뷰, 정보나루 인기대출 순위를 점검한다. 다음 배포에서는 상세 조회 결과를 임시 캐시로 제공한다. 서재·리뷰에서 ISBN을 확정할 때 저장하는 항목은 책 식별자와 선택 당시 제공 필드의 해시·출처 기록이다. 기존 클라이언트의 저장된 책 ID도 계속 사용할 수 있다.

## 조사와 복구

BookAppAI에서 `TRANSITION_DATABASE_URL`을 조사할 PostgreSQL로 설정한다. 비밀번호는 비밀 저장소나 실행 환경에서 전달한다. 별도 DB이면 서비스와 AI 각각의 DSN으로 실행한다. Redis 집계는 `TRANSITION_REDIS_HOST`, 필요하면 PORT·DB와 REDISCLI_AUTH를 설정한 후 같은 호스트에 설치된 redis-cli로 실행한다. 캐시 키 이름과 값은 보고서에 포함하지 않는다.

```sh
umask 077
python -m tools.transition_inventory catalog --output catalog-impact.json
python -m tools.transition_inventory ai --output ai-impact.json
```

건수, 보호 대상 해시, 장르별 검증 권수와 기준 시점을 검토한다. 서재·리뷰 연결이 없는 책에는 연결 해제 이력이 있을 수 있다. 행 ID가 포함된 manifest는 운영자 전용 공간에 보관한다. 복구 시점을 확보한 뒤 복제본에서 복원 및 보호 대상 비교를 먼저 시험한다. DB 계정이 클러스터 식별자를 조회할 수 없으면 운영팀에서 식별한 고정값을 TRANSITION_CLUSTER_ID로 조사·실행에 동일하게 제공한다.

다음 명령은 해당 파일의 체크섬과 영향 범위에 별도 승인이 있을 때만 사용한다.

```sh
python -m tools.transition_inventory catalog --apply catalog-impact.json --approved-sha256 "$APPROVED_SHA256" --batch-size 20
```

같은 파일을 재실행하면 이미 적용된 행을 구분한다. 조사 후 바뀐 행은 건너뛰며 새 보고서에 담는다. 보류한 코퍼스 행은 이 도구로 삭제하지 않는다. 운영 가입자 활동이 있는 시간에는 변경 전후 집계의 차이를 신규 사용자 활동과 대조한다. 복구는 격리한 백업에서 대상 필드만 가져와 적용 후 해시와 동일한 행에 복원한다.

## 검증용 데이터와 품질 평가

기본 30권의 제목·저자는 Wikidata 구조화 자료, 소개는 이 프로젝트용으로 작성했다. 보강 목록은 판본별 원본 참조를 따로 둔다. 영어 원서 및 오디오북은 소개에 판본 형태를 표시한다. 정보나루 소개와 표지는 포함하지 않는다. [Wikidata 이용조건](https://www.wikidata.org/wiki/Wikidata:Licensing) · [Harvard Library 서지 데이터 이용조건](https://library.harvard.edu/services-tools/harvard-library-datasets)

별도 PostgreSQL에서 `DATABASE_URL`을 설정하고 마이그레이션한 뒤 수행한다. 허용 근거가 확인된 필드는 여섯 가지 용도와 정책 버전에 연결된다. 원문 저장이 허용되지 않은 필드에는 해시만 남는다. 태그, 임베딩, 추천 근거는 각각 입력 버전과 모델에 연결한다. 출처명·수집 경로만 바꿔 기존 벡터를 승인할 수 없다.

```sh
python -m alembic upgrade head
python -m tools.seed_reviewed
python -m tools.seed_reviewed --supplement
for isbn in $(jq -r '.[].isbn' evaluation/reviewed/seed.json evaluation/reviewed/supplement.json); do
  python -m tools.reviewed_corpus index "$isbn" || break
done
python -m tools.evaluate_reviewed run-1.jsonl
python -m tools.evaluate_reviewed run-2.jsonl
```

각 실행에서 고정된 18개 질문의 평가 기준에 맞는 반환 ISBN만 선별해 질문별 배열로 JSON에 기록한다. 가상 수상·작가 질문에서는 두 번 모두 정상 빈 결과를 요구한다. 번아웃 사례의 추천 이유와 상세 소개는 따로 읽고 기록한다.

```sh
python -m tools.grade_reviewed run-1.jsonl judgments-1.json --record
python -m tools.grade_reviewed run-2.jsonl judgments-2.json --record
```

두 실행에서 첫 결과 13/18, 한 권 이상 15/18, 대조 2/2를 충족한 같은 데이터·모델 조합만 재개할 수 있다. 운영에 준비한 검증 DB에서 나온 release 값을 Spring과 AI의 GALPI_REVIEWED_RELEASE에 동시에 설정한다. 이 값이 비어 있거나 DB의 평가 기록·입력 버전·모델과 다르면 갈피가 점검 상태를 반환한다. 공개 후 app.metrics의 corpus_request_blocked 및 reviewed_search, 공급자 오류 로그, 정상 빈 결과 비율을 확인한다. 점검으로 복귀할 때는 이 값만 비우고 두 서비스를 재기동한다.

## 한국어판 후보 발굴과 서재 키워드 검증

하버드 도서관의 Alma 서지 레코드에서 한국어 종이책을 찾는다. 출처, 단일 판본 ISBN, 한국어 제목, 저자 역할, 미 의회도서관 주제명(LCSH)이 확인된 레코드의 필드만 후보 파일에 담는다. 소개 후보에는 카탈로그의 주제명만 들어간다. 출판사 책 소개와 표지 이미지는 수집하지 않는다. 데이터 제공처는 Harvard Library, OCLC, Library of Congress다. [서지 메타데이터 공개 조건](https://library.harvard.edu/services-tools/harvard-library-datasets)

아래 명령은 BookAppAI에서 실행한다. 먼저 파일의 판본과 주제 근거를 검토한다. 사용하기로 한 ISBN의 자료만 별도 검증 DB에 가져와 색인한다. `--new-only`는 기존 ISBN의 편집본을 보존한다. 추가한 도서는 위의 두 차례 품질 평가를 거쳐 공개한다.

```sh
python -m tools.discover_harvard --subject 'Bookstores' --subject 'Science fiction' --pages 1 --output candidates.json
python -m tools.reviewed_corpus import approved-fields.json --new-only
```

이번에 한국어 소개까지 편집한 8권은 `python -m tools.seed_reviewed --discovery`로 검증 DB에 넣을 수 있다. 이후 `evaluation/reviewed/discovery.json`에 있는 ISBN을 색인한다.

## 서재 키워드

서재 키워드는 ‘읽는 중’과 ‘완독’ 도서의 ISBN으로 조회한다. 성남시 중앙·판교도서관의 2026년 1월 7일 장서 목록에서 분류기호와 주제어를 추려 로컬 색인에 담았다. 새 책과 기존 책 모두 같은 색인을 조회한다. 원본 파일과 색인 재생성 명령은 `BookAppAI/tools/build_shelf_catalog.py`에 있다. `corpus_use_policy`의 `SEONGNAM_HOLDINGS / 20260107`이 해당 용도를 허용할 때만 이 색인을 사용한다. [성남시 도서관 도서목록과 이용조건](https://www.data.go.kr/data/3071094/fileData.do)

외부 AI 전송이 허용된 제목·저자·소개가 있는 책은 현재 입력 버전의 Gemini 태그도 사용한다. 태그가 없으면 서재 조회 시 ISBN·입력 버전·모델별로 한 번 등록하고 백그라운드에서 처리한다. 처리 직전에 이용조건과 입력 버전을 다시 확인한다. 키워드를 한글로 통일한 뒤 책 한 권당 한 번씩 세고, 각 키워드의 근거 ISBN을 반환한다. 갈피 점검 중에도 서재 키워드를 조회할 수 있다. 공유 링크에서 추천하는 책은 갈피 공개 판정을 통과한 목록에서 고른다.
