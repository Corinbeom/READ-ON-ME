## 성능/지표 측정 가이드

이 프로젝트는 Prometheus/Grafana 없이도 **재현 가능한 수치(p50/p95/p99, error rate, RPS)**를 만들 수 있도록
Spring/FastAPI에 요청 단위 latency 로깅과 벤치 스크립트를 제공합니다.

### 1) 무엇을 측정할까(추천 지표)

- **p50/p95/p99 latency**: 사용자 체감(특히 p95)
- **RPS(처리량)**: 같은 자원에서 얼마나 처리 가능한지
- **error rate**: 실패/타임아웃 비율
- **캐시 효과**: 동일 쿼리 반복 시 p95 개선 (Kakao 검색 캐시)

### 2) 준비

도커 스택이 떠 있어야 합니다:

```bash
docker compose up -d --build
```

### 3) 벤치마크 실행 (외부 의존성 없음)

#### A. 책 검색(캐시 효과 확인)

동일 쿼리를 여러 번 호출해 p95를 비교합니다.

```bash
python tools/bench/bench_http.py --url "http://localhost:8080/api/books/search?query=미움받을용기&size=10" -n 100 -c 10
```

#### A-1. (권장) 3회 반복 + Redis hit rate까지 한 번에

```bash
python tools/bench/bench_cache_search.py --query "미움받을용기" -n 80 -c 10 --runs 3
```

#### B. AI 검색(End-to-End)

Spring `/api/ai/search`는 내부적으로 FastAPI를 호출합니다. 실제 LLM을 호출하는 측정은 비용이 발생하므로 3회만 순차로 실행해 응답 시간을 기록합니다.

```bash
python tools/bench/bench_http.py --method POST --url "http://localhost:8080/api/ai/search" --json "{\"query\":\"스릴러 소설 추천해줘\"}" -n 3 -c 1
```

#### B-1. E2E vs Direct (추가 LLM 호출이 필요한 경우에만)

```bash
python3 tools/bench/bench_ai_search.py --query "스릴러 소설 추천해줘" -n 1 -c 1 --runs 3
```

#### C. FastAPI 직접 호출

```bash
python tools/bench/bench_http.py --method POST --url "http://localhost:8000/api/ai/search" --json "{\"query\":\"힐링 에세이 추천\"}" -n 3 -c 1
```

### 2026-11-09 로컬 기준값

Spring `/api/ai/search`에 같은 질문을 순차로 3회 보낸 결과 모두 HTTP 200이었고, 응답 시간은 5.88초, 3.64초, 3.53초였습니다. 첫 요청은 모델/연결 준비 시간이 포함될 수 있습니다. 표본이 3건뿐이므로 이 값으로 p95나 운영 처리량을 추정하지 않습니다. 짧은 동일 질문 캐시는 실제 사용 패턴을 더 측정한 뒤 결정합니다.

### 팁

- AI 컨테이너는 최초 실행 시 모델 다운로드/로딩으로 지연이 커질 수 있으니 **warmup 이후 측정**
- 동시 실행 상한과 대기열 테스트는 실제 LLM 대신 지연 응답을 반환하는 모의 FastAPI로 실행합니다. 실제 API에 동시 요청을 대량으로 보내지 않습니다.


