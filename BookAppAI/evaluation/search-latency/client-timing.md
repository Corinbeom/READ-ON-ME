# 갈피 검색 접수와 화면 표시 시간

인증된 검색 등록 요청 한 건에서 사용량 제한 필터가 확인한 이용 상태를 접수 서비스가 재사용한다. 사용 가능·점검·확인 실패 어느 판정도 다음 요청으로 넘기지 않는다. 작업 실행 전, 모델에 후보를 보내기 전, 기존 결과 조회 시에는 각 경로의 검사를 수행한다.

Spring이 완료 알림을 보낼 때 작업 ID는 따옴표 없는 UUID로 전달된다. 클라이언트는 이 형식과 JSON 문자열 형식을 모두 인식해 즉시 작업 결과를 조회한다. 알림을 놓치면 기존 주기적 조회로 복구한다.

## 시간 읽기

Flyway V12가 기존 검색 작업에 선택적인 시간 필드 5개를 추가한다. 단위는 밀리초이고 기준은 모두 같은 클라이언트의 검색 버튼 클릭이다.

| 필드 | 관측 시점 |
|---|---|
| client_submit_ms | 접수 응답 수신 |
| client_signal_ms | 해당 작업의 SSE 완료 알림 수신. 관측하지 못했으면 NULL |
| client_fetch_start_ms | 처음으로 최종 상태를 반환한 조회의 요청 시작 |
| client_fetch_end_ms | 해당 응답 수신 |
| client_display_ms | 최종 화면 커밋 뒤 프레임 표시 기회를 지난 시점. 이미지 다운로드 완료와는 별개 |

결과 재조회 왕복 시간은 fetch_end에서 fetch_start를 빼고 화면 표시 지연은 display에서 fetch_end를 뺀다. 알림이 조회 도중 도착할 수도 있다. 서버 대기·처리는 기존 created_at, started_at, completed_at으로 계산한다. 서버 시각과 단말 시각을 직접 빼지 않는다.

본인이 방금 시작하고 같은 화면에서 끝까지 본 검색을 대상으로 최종 화면 뒤에 한 번 전송한다. 이미 접수됐을 수 있는 재시도, 복원한 검색, 화면 이탈·백그라운드 전환은 표본에서 제외한다. 서버는 본인의 만료 전 완료·실패 작업에 첫 유효 표본만 저장하며 기존 작업과 함께 정리한다. 측정값 전송 실패는 추천 결과에 영향을 주지 않는다. NULL에는 구버전 클라이언트와 미수집 사례도 포함되므로 이탈률로 해석하지 않는다.

운영에서 배포 이후 동일 시간대의 성공 작업을 비교할 때 아래 집계를 사용한다. 기간은 보존된 작업 범위 안에서 지정한다.

```sql
SELECT count(*) AS completed_jobs,
       count(client_display_ms) AS visible_samples,
       round(avg(client_submit_ms)) AS mean_submit_ms,
       round(avg(client_fetch_end_ms - client_fetch_start_ms)) AS mean_terminal_fetch_ms,
       round(avg(client_display_ms - client_fetch_end_ms)) AS mean_display_after_fetch_ms,
       round(avg(client_display_ms)) AS mean_click_to_display_ms,
       count(*) FILTER (WHERE client_display_ms > 10000) AS over_10s,
       round(100.0 * count(*) FILTER (WHERE client_display_ms > 10000)
             / nullif(count(client_display_ms), 0), 1) AS over_10s_pct
FROM ai_search_jobs
WHERE status = 'SUCCEEDED' AND completed_at >= :since_utc;
```

## 서버 지연을 작업별로 찾기

운영 DB의 `ai_search_jobs.id`를 AI와 Spring 로그의 `request_id`로 검색한다. 질문과 책 내용은 계측 로그에서 수집하지 않는다. 아래 시간은 밀리초다.

| 로그 | 측정 구간 |
|---|---|
| AI `reviewed_search` | `index_ms`는 공개 판정과 색인 로드, `embed_ms`는 질문 임베딩, `rerank_ms`는 추천 순위 결정과 장애 대체 전체다. `ranker`는 결과에 실제 표시된 GEMINI·GROQ·FALLBACK이며 빈 결과는 NONE이다. |
| 같은 AI 로그의 `other_ms` 세부 항목 | `candidate_ms`는 검색 진입부터 후보 권한 검사용 첫 SQL 실행 전까지에서 임베딩을 뺀 값이다. `input_db_ms`는 모델 호출 전 후보 잠금·권한 조회 SQL 실행 합계, `evidence_db_ms`는 호출 후 근거 조회·저장 SQL 실행 합계다. 그중 새 근거를 추가한 시간은 `evidence_insert_ms`다. `tx_exit_ms`는 트랜잭션 종료(커밋 또는 롤백) 시간이다. |
| `candidate_ms` 안에서 측정한 시간 | `candidate_import_ms`는 검색 함수에서 의존 모듈을 불러오는 시간이다. `vector_score_ms`는 후보 벡터의 점수를 계산하고 정렬하는 시간이다. 재시작 직후와 두 번째 요청에서 두 값을 각각 비교한다. |
| Spring `reviewed_http_headers`, `reviewed_http_body` | 첫 로그는 응답 헤더 수신과 HTTP 상태를, 두 번째는 성공 응답의 본문 수신·디코딩 완료를 표시한다. `decode_ms`에 두 시점 사이의 경과 시간이 담긴다. |
| Spring `reviewed_finish` | `handoff_ms`는 완료 또는 오류 신호가 작업 처리 스레드로 넘어가는 대기 시간이다. `serialize_ms`는 결과 JSON 변환과 상태 필드 설정, `store_ms`는 이를 제외한 완료 트랜잭션 시간(행 조회·저장·커밋 포함)이다. `committed`는 트랜잭션 성공 여부이며, 검색 결과는 작업의 status로 확인한다. |

`candidate_ms`, `input_db_ms`, `evidence_db_ms`, `tx_exit_ms`는 기존 `other_ms` 안에 포함된다. 이 네 값을 뺀 잔여 시간에는 파이썬 쪽 결과 조립과 검증 등이 있다. 실행되지 않은 단계는 0이 될 수 있고, 상류 호출 전에 작업이 막히면 `handoff_ms`는 null이다. AI 로그 종료와 Spring 헤더 수신의 시각 차이는 같은 호스트의 시계가 맞는 경우에만 비교한다.

배포 전후에는 같은 질문과 계정에서 측정한다. AI·Spring 재기동 뒤 첫 검색을 따로 표시하고 같은 질문의 첫 검색끼리 비교한다. 후속 검색에서는 Gemini 직접 응답과 Groq 대체를 나눠 본다. 웹 화면 계측이 있는 표본에서만 10초 초과 비율을 계산하며, 표본 수와 실패·빈 결과 건수도 같이 기록한다.

## 문장 번호 형식의 저장 결과 비교

같은 121권 릴리스의 보관된 평가 2회(회당 고정 질문 20개와 번아웃 질문 1개)를 재생했다. 당시 반환한 책과 추천 이유를 고정하고, 모델에 제공하는 소개 문구 범위에서 원문 인용을 문장 번호로 정확히 복원할 수 있는지 검사했다. 121개 반환 항목 중 이유·근거가 모두 남아 있는 61개가 비교 대상이었다.

| 평가 | 근거가 있는 항목 | 한 문장으로 정확히 복원 | 연속된 문장 번호로 정확히 복원 | 원문 형식 → 번호 형식 출력 바이트 |
|---|---:|---:|---:|---:|
| 1차 | 22 | 1 | 22 | 7,586 → 2,643 |
| 2차 | 39 | 19 | 38 | 12,270 → 5,725 |

정확히 복원한 60건에서 동일한 임시 책 ID와 추천 이유를 포함하는 JSON 객체의 UTF-8 바이트 합계가 19,856에서 8,368로 57.9% 줄었다. 모델 입력에 추가되는 문장 번호, 실제 토큰 수와 처리 시간은 이 실험의 측정 대상에 포함되지 않는다. 다음 비교에서는 복수 문장 번호를 허용하고, 기존 근거와 정확히 대응하지 않는 사례의 표시 품질을 함께 평가한다. 실제 모델로 다시 고른 책의 적합성과 응답 시간을 확인할 때까지 기존 추천 방식을 유지한다.

BookAppAI에서 아래 명령으로 저장된 두 JSONL을 비교할 수 있다. 외부 API 호출과 DB 연결은 필요하지 않다.

```sh
PYTHONPATH=. python evaluation/search-latency/replay_evidence.py first.jsonl second.jsonl
```
