# ISBN 기반 코퍼스 편입 파일럿 — 2026-11-12

## 구현

- 도서관 정보나루 인기대출 목록에서 KDC·기간·페이지로 ISBN을 찾는 경로와, 출판사 등 외부 목록의 ISBN을 받는 경로를 추가했다. 검색어는 후보 발견 기록일 뿐 최종 장르 라벨이 아니다.
- 두 경로 모두 카카오 `target=isbn` 조회 결과의 ISBN이 정확히 일치해야 책 정보를 사용한다. 발견 출처에 제목이 있으면 제목도 대조한다. 소개가 짧으면 정보나루 ISBN 상세 조회로 실제 소개를 보강한다. 검토 목록은 `/tmp`의 JSON 파일로 남기며, **명시적으로 선택한 ISBN만** `CURATED_SEED` 작업으로 접수한다. 접수 시에도 출처를 다시 조회한다.
- `CURATED_SEED`는 기존 검수 워커의 ISBN·서지·중복·형식·Gemini 근거 검사를 사용한다. 출처 URL과 발견 맥락은 작업 페이로드에, 도서 원천은 `book_corpus.source`에 남는다. 동일 ISBN의 관리자 작업은 중복 접수되지 않는다.

## 실제 소량 검증

로컬 환경에는 `LIBRARY_BIGDATA_API_KEY`가 없어 정보나루 **인기대출 조회는 실호출하지 못했다**. 해당 응답 형식과 중복 제거는 모의 응답 테스트로 확인했다. 대신 [문학동네 『각자의 정원』](https://munhak.com/bookAndAuthor/books/detail/10090), [『종말까지 다섯 걸음』](https://munhak.com/bookAndAuthor/books/detail/10225), [『치즈 이야기』](https://munhak.com/bookAndAuthor/books/detail/10166)의 출판사 목록에서 ISBN 3건을 골랐다. 입력 목록은 `/tmp/readonme-publisher-isbns-2026-11-12.json`, 카카오 ISBN 대조 결과는 `/tmp/readonme-curated-pilot-2026-11-12.json`에 있다.

| 책 | ISBN 대조 | 처리 | 이유 |
| --- | --- | --- | --- |
| 『각자의 정원』 | 일치 | 접수 보류 | 카카오 소개 252자가 거의 작가 이력과 이전 작품 설명이며 이 책의 줄거리 근거가 부족하다. |
| 『종말까지 다섯 걸음』 | 일치 | `INDEXED` / `ACTIVE` | 소개에 소설집과 종말·좀비·외계인 이야기의 근거가 있다. 워커가 `STORY`로 분류하고 실제 문구를 인용했다. |
| 『치즈 이야기』 | 일치 | 접수 보류 | 카카오 소개 251자가 대부분 작가 이력으로 시작해 이 책의 구체적 이야기 근거가 약하다. |

편입 후 로컬 코퍼스는 `ACTIVE 13 / LEGACY 956 / DISABLED 29`다. 실제 작업 ID는 `dcdc9d7f-f035-45bf-8707-65af49ce9b4c`이며 출처 URL이 작업에 저장됐다.

## 검색 노출 확인

`SF 소설 추천`과 `한국소설 추천`을 다시 실행했다. 새 책은 두 질의 모두 검색 후보에 없었다. 결과 원본은 `/tmp/readonme-curated-search-2026-11-12.json`에 있다. 임베딩 유사도 순위는 각각 약 196위·285위로 벡터 상위 30권 밖이었다. `SF` 태그가 없고, `한국소설` 질의에서는 `소설` 태그가 있어도 유사도 기준 키워드 상위 20권 밖이었다. 따라서 **편입 성공만으로 추천 노출이 보장되지 않음**을 실제로 확인했다.

다음에는 ISBN 출처와 함께 **책 자체를 설명하는 충분한 소개**를 확보할 수 있는지 먼저 검증한다. 정보나루 키가 설정되면 같은 세 권의 상세 소개를 확인하고, 분야별 소량 후보를 더 찾는다. 이후 적합한 검수 도서가 반복해서 검색 후보 밖에 있을 때, 키워드·후보 풀·점수의 영향을 책 단위로 평가한다. `ACTIVE`라는 상태만으로 일괄 가산점은 주지 않는다.

수동 ISBN 목록 형식은 `{"candidates":[{"isbn":"9791141602499","discovery_source":"PUBLISHER_CATALOG","source_url":"https://munhak.com/bookAndAuthor/books/detail/10225","target_subject":"SF·한국소설","source_context":{"title":"종말까지 다섯 걸음"}}]}`이다. `source_url`과 `source_context.title`은 출처 확인용이고, `target_subject`는 분류 결과에 강제로 쓰이지 않는다.
