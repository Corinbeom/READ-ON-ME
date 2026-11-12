# ISBN 기반 코퍼스 편입 파일럿 — 2026-11-12

## 구현과 키 위치

- 정보나루 인기대출 목록(KDC·기간·페이지), 정보나루 도서 검색, 출판사 등 외부 ISBN 목록에서 후보를 찾는 경로를 만들었다. 검색어와 KDC는 **발견 맥락**으로만 저장하며 도서의 장르 라벨에 복사하지 않는다.
- 카카오 `target=isbn` 결과의 ISBN이 정확히 일치해야 메타데이터를 사용한다. 발견 출처에 제목이 있으면 제목도 대조한다. 정보나루 ISBN 상세 소개는 실제 출처가 확인된 경우에만 사용한다. 소개가 더 짧아도 책 자체를 더 잘 설명한다면 검토자가 `--naru-isbns`로 선택할 수 있다.
- 선택한 ISBN만 별도 `CURATED_SEED` 작업으로 기존 검수 워커에 접수한다. 출처 URL과 발견 맥락은 작업 페이로드에, 도서 원천은 코퍼스에 남는다. 같은 ISBN의 관리자 접수는 중복되지 않는다.
- 키는 처음부터 `BookAppBack/.env`에 있었다. `BookAppAI/.env`에 없어서 AI 워커의 독립 프로세스에서는 보이지 않았다. 로컬 AI 환경 파일에도 같은 키를 설정했다. 두 환경 파일은 Git 추적 대상이 아니며 값은 보고서에 기록하지 않았다.

## 정보나루 실호출

같은 키로 ISBN 상세 조회와 `srchBooks` 도서 검색은 정상 응답했다. `loanItemSrch` 인기대출 목록은 날짜 범위·요청 건수·주소를 바꿔도 8~30초에 시간 초과됐다. 이 문제는 인증 실패가 아니다. 인기대출 경로는 모의 응답 테스트까지만 통과했고, 이번 실제 후보는 정보나루 도서 검색 및 출판사 목록에서 얻었다. 도서 검색도 키워드 일치 결과를 반환하므로 개별 ISBN·소개 검수가 필수다.

## 편입 결과

출판사 목록에서 세 ISBN을 골라 카카오와 대조했다. [『종말까지 다섯 걸음』](https://munhak.com/bookAndAuthor/books/detail/10225)은 `ACTIVE`로 편입됐다. [『각자의 정원』](https://munhak.com/bookAndAuthor/books/detail/10090)은 정보나루의 책 중심 소개로 접수했으나 Gemini가 `동화`로 태깅했다. 출판사와 도서관은 장편소설로 분류하므로 로컬 코퍼스에서 `DISABLED`로 바꾸고 이전 상태를 `/tmp/readonme-garden-classification-before-disable-2026-11-12.json`에 보관했다. [『치즈 이야기』](https://munhak.com/bookAndAuthor/books/detail/10166)은 정보나루 소개를 사용했으나 모델이 인용문을 줄임표로 변형해 `UNVERIFIED_EVIDENCE`로 `HOLD`됐다. 근거 검증 규칙은 완화하지 않았다.

정보나루 `srchBooks`에서 `한국소설` 검색으로 ISBN 후보 5건을 검증했다. 2건은 자동 제목 대조에서 표기 차이가 나 `HOLD`됐으며, 실제 다른 책인지까지 판정한 것은 아니다. 3건은 검토 대상으로 남았다. 시리즈 후속작 『메리골드 마음 사진관』은 이번 일반 소설 시험에서 보류했다. 『재인, 재욱, 재훈』과 『씨 유 어게인』은 책 소개를 확인한 뒤 정보나루 소개로 접수했고 둘 다 `ACTIVE`가 됐다. 현재 로컬 코퍼스는 **`ACTIVE 15 / LEGACY 956 / DISABLED 30`**이다.

원본: 출판사 입력 `/tmp/readonme-publisher-isbns-2026-11-12.json`, 출판사 검토 `/tmp/readonme-curated-pilot-2026-11-12.json`, 정보나루 검토 `/tmp/readonme-naru-search-pilot-2026-11-12.json`. `HOLD`·제외된 책을 임의로 `ACTIVE`로 바꾸지 않았다.

## 검색 노출

『종말까지 다섯 걸음』은 `SF 소설 추천`, `한국소설 추천`의 검색 후보에 들지 못했다. 임베딩 유사도 순위는 각각 약 196위·285위였다(`/tmp/readonme-curated-search-2026-11-12.json`). 반면 『재인, 재욱, 재훈』은 새 편입 뒤 `따뜻한 이야기를 읽고 싶어`, `한국소설 추천` 양쪽에서 Gemini 입력 후보에 들었고, 근거가 확인된 이유와 함께 최종 선택됐다(`/tmp/readonme-naru-search-results-2026-11-12.json`). 『씨 유 어게인』은 두 질의의 검색 후보에 들지 못했다.

소량의 실제 결과만으로 신규 도서 전체의 노출률을 추정할 수 없다. 다음에는 주제별 후보를 더 모으되, **책 중심 소개의 품질과 분류 결과를 편입 후에도 확인**한다. 적합한 도서가 반복해서 후보 밖에 있을 때 검색 점수와 상한을 조정한다. 상태가 `ACTIVE`라는 이유만으로 일괄 가산점을 주지 않는다.

수동 ISBN 목록 예시: `{"candidates":[{"isbn":"9791141602499","discovery_source":"PUBLISHER_CATALOG","source_url":"https://munhak.com/bookAndAuthor/books/detail/10225","target_subject":"SF·한국소설","source_context":{"title":"종말까지 다섯 걸음"}}]}`.
