## 트러블슈팅 “신뢰도” 올리는 검증/재발방지 가이드

이 문서는 포트폴리오의 트러블슈팅 항목을 **측정 가능 + 재발 방지(회귀 테스트)** 형태로 보강하기 위한 실행 가이드입니다.

---

### 1) 학습서 노이즈로 추천 품질 저하

#### 재발 방지(회귀 테스트)
- 위치: `BookAppAI/tests/test_noise_filter.py`
- 검증: 수능/모의고사/문제집 등 키워드가 포함된 도서는 `contains_exclusion_terms()` / `should_skip_book()`에서 필터링되는지 확인

실행:

```bash
cd BookAppAI
pytest -q
```

#### 측정(선택)
- “Top-5 결과 중 노이즈 비율”처럼 기준을 정하고, 샘플 쿼리를 20~50개 모아 수동 라벨링 후 비교 추천

---

### 2) 저자 기반 질의 적중률 저하

#### 재발 방지(회귀 테스트)
- 위치: `BookAppAI/tests/test_author_intent_regression.py`
- 검증: “OO 작가의 책” 질의에서 `focus_author`가 정상 추출되며, 무드 토큰(감성/분위기 등)에 의해 잘못 author로 잡히지 않는지 확인

실행:

```bash
cd BookAppAI
pytest -q
```

#### 도커로 테스트 실행(권장)

```bash
docker compose build ai
docker compose run --rm --entrypoint python ai -m pytest -q
```

#### 측정(선택)
- 기준 예시: “Top-5에 목표 저자 도서 포함률”
- 샘플 쿼리(저자 10명 × 2질의 등)를 만들어 전/후 비교 추천

---

### 3) 추천 ID → 도서 정보 매핑 비용 과다

#### 재발 방지(구조)
- `/api/books/details` 배치 API를 유지하여 N+1 네트워크 호출을 회피

#### 측정 스크립트
- 위치: `tools/bench/compare_batch_vs_single.py`
- 방식: `/api/books/popular`에서 K권을 뽑아
  - 단건 상세 조회 K회 vs 배치 조회 1회
  - 총 소요 시간/요청 수 감소율 비교

실행:

```bash
python tools/bench/compare_batch_vs_single.py --k 10
```


