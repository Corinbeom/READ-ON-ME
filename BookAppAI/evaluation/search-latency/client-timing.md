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
