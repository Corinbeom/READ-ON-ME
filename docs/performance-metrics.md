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

Spring `/api/ai/search`는 내부적으로 FastAPI를 호출하므로, 전체 E2E 지연을 확인할 수 있습니다.

```bash
python tools/bench/bench_http.py --method POST --url "http://localhost:8080/api/ai/search" --json "{\"query\":\"스릴러 소설 추천해줘\"}" -n 30 -c 3
```

#### B-1. (권장) E2E vs Direct 3회 반복 + 범위 + 에러율

```bash
python3 tools/bench/bench_ai_search.py --query "스릴러 소설 추천해줘" -n 30 -c 3 --runs 3
```

#### C. FastAPI 직접 호출

```bash
python tools/bench/bench_http.py --method POST --url "http://localhost:8000/api/ai/search" --json "{\"query\":\"힐링 에세이 추천\"}" -n 30 -c 3
```

### 팁

- AI 컨테이너는 최초 실행 시 모델 다운로드/로딩으로 지연이 커질 수 있으니 **warmup 이후 측정**
- 동시성(c)을 너무 크게 올리면 로컬 환경에서 병목이 발생할 수 있어, `c=3~10`부터 시작 추천


