## READ-ON-ME

책을 좋아하는 사용자를 위한 AI 기반 독서 동반자 서비스입니다. React Native(Expo) 앱, Spring Boot 백엔드, FastAPI AI 워커가 함께 동작하며 카카오 도서 검색, 개인 서재 관리, 리뷰·알림, 자연어 기반 AI 추천을 지원합니다.

### 리포지토리 구조

| 경로 | 설명 | 주요 기술 |
| --- | --- | --- |
| `BookAppFront/` | Expo Router 기반 모바일 앱. 로그인/라이브러리/리뷰/알림/AI 책 선택 화면 제공. | React Native 0.81, Expo 54, TypeScript |
| `BookAppBack/` | 핵심 API 서버. 카카오 도서 검색, JWT 인증, 리뷰·알림, Redis 캐싱, AI 연동을 담당. | Spring Boot 3, Java 17, Gradle |
| `BookAppAI/` | 카카오 검색 결과를 확장·임베딩·벡터 검색하는 AI 워커. | FastAPI, SQLAlchemy, SentenceTransformers |


---

## 시스템 개요

1. **모바일 앱 → Spring Boot**  
   - 로그인/JWT 발급, 카카오 검색 프록시, 서재 상태 변경, 리뷰 발행, SSE 알림, AI 검색 요청 등을 처리합니다.

2. **Spring Boot → FastAPI**  
   - AI 검색 작업을 PostgreSQL에 저장하고 최대 2건만 FastAPI로 전달합니다. AI 추천에 필요한 모든 유저의 서재 데이터는 `/api/library/all`에서 노출합니다.

3. **FastAPI → PostgreSQL + pgvector**  
   - 카카오 검색 결과를 받아 Gemini 태깅, SentenceTransformer 임베딩으로 `book_corpus` 테이블을 구성하고, 자연어 쿼리/유사도/저자 기반 검색을 제공합니다.

4. **Redis + SSE**  
   - 리뷰 좋아요 알림을 Redis 캐시와 함께 처리하고, `NotificationListener`가 구독하는 SSE로 푸시합니다.

---

## 주요 기능

- **카카오 도서 검색**: 제목/저자/ISBN으로 검색, 상세·에디션·인기 도서 조회.
- **회원 및 서재 관리**: 회원가입·로그인·프로필 수정·비밀번호 변경, 도서 상태(읽을 책/읽는 중/완독) 관리.
- **리뷰 & 좋아요**: 리뷰 CRUD, 좋아요 토글, 알림 발송, 개인 리뷰 목록.
- **실시간 알림**: SSE(EventSource)로 좋아요 알림 스트림 제공.
- **AI 책 선택**: 자연어 조건으로 책을 찾고, 후보 두 권의 추천 근거를 비교한 뒤 한 권을 선택합니다. 책갈피 캐릭터가 검색·비교·선택·빈 결과 상태를 안내합니다.
- **추천 코퍼스 수집**: 관리자가 키워드 배치를 접수하면 카카오 후보를 영속 작업 큐에 저장합니다. ISBN·제목·소개 검증, 중복·주제 유사도 검사, Gemini 분류를 통과한 책만 추천 코퍼스에 넣습니다.
- **협업 필터링**: `/recommendations/{userId}`로 사용자 기반 추천 제공.

---

## 사전 준비

- Node.js 20+ / npm 10+
- Java 17 JDK
- Python 3.12
- PostgreSQL 15+ (pgvector 확장 설치 필요)
- Redis 7+
- Expo Go 앱 또는 에뮬레이터(iOS/Android)

※ 환경 변수(.env)는 각 서비스 디렉터리에 별도 구성해야 합니다. (요청에 따라 본 문서에서는 상세 내용을 생략했습니다.)

- Docker로 재현 가능한 실행 환경을 구성하려면 `docs/environment-variables.md`를 참고하세요.

---

## 실행 방법

### 1. Spring Boot API (`BookAppBack`, 기본 포트 8080)

```bash
cd BookAppBack
./gradlew bootRun
```

- 테스트: `./gradlew test`
- 상태 확인: `curl http://localhost:8080/api/books/test`

### 2. FastAPI AI 워커 (`BookAppAI`, 기본 포트 8000)

```bash
cd BookAppAI
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- 테스트: `pytest`
- 테스트 의존성: `pip install -r requirements-test.txt`
- 데이터 빌드: `POST /api/books/fetch-and-filter`에 `{"keywords":["문학"]}` 전달 → `202`와 `run_id` 반환. 소량 검증에는 `{"keywords":["에세이"],"max_pages_per_term":1,"max_new_books":5}`를 사용합니다. 두 제한값은 선택 사항이며 각각 카카오 검색어(프록시 검색어 포함)별 최대 1–5페이지(기본 5), 새로 접수할 책 최대 1–20권(기본 제한 없음)입니다. 이 상한은 추천 품질을 보장하지 않으며 카카오 결과의 앞부분만 검사합니다. 진행 상태는 `GET /api/books/ingestion-runs/{run_id}`로 확인합니다. 동시에 다른 배치를 요청하면 `409`와 실행 중인 ID를 반환합니다. 배치의 `DONE`은 카카오 후보 탐색 종료를 뜻하며, 개별 책의 처리는 응답의 `candidate_counts`로 확인합니다. 같은 ISBN도 새 배치에서는 새 키워드 기준으로 재평가할 수 있습니다. 동일 배치 작업 또는 서재 작업에 더 긴 실제 소개가 다시 들어오면 `PENDING`/`RETRY` 페이로드를 갱신하거나 `HOLD`를 재접수합니다.
- 단일 도서 접수: `POST /api/books/embed-single` → `202`와 `job_id` 반환. `GET /api/books/ingestion-jobs/{job_id}`에서 `INDEXED`, `REJECTED`, `HOLD`, `FAILED` 등 최종 상태를 확인합니다. `202`는 코퍼스 반영 완료를 뜻하지 않습니다. 같은 ISBN이라도 카카오 배치와 사용자 서재의 검수 작업은 별도로 기록하며, 서재 도서에는 배치 검색어의 주제 유사도 필터를 적용하지 않습니다.
- 짧은 소개 보강: AI 워커에 `LIBRARY_BIGDATA_API_KEY`를 설정하면 `SHORT_DESCRIPTION` 후보만 도서관 정보나루에서 ISBN 상세 조회합니다. 응답 ISBN이 일치하고 실제 소개가 30자 이상일 때만 처리하며, 조회 실패나 소개 부족은 `HOLD`로 남깁니다. 기존 보류 작업은 `cd BookAppAI && python -m tools.enrich_hold --job-id <ID>`로 미리 보고, 같은 명령에 `--apply`를 붙여 한 건씩 재접수합니다. 재접수 후 `GET /api/books/ingestion-jobs/{id}`에서 최종 상태를 확인합니다.
- 기존 코퍼스 점검: `python -m tools.audit_corpus --limit 1000 --output /tmp/corpus-audit.jsonl`로 변경 없이 보고서를 생성합니다. 검토한 명확한 교재·세트·`977` 정기간행물만 `--apply-ids 12,34`처럼 한 번에 최대 20권씩 제외할 수 있습니다.
- 로컬 `LEGACY` 코퍼스의 1차 제외 내역과 복구 기준은 [검증 기록](BookAppAI/evaluation/legacy_corpus_cleanup_2026-11-11.md)에 있습니다. 다른 DB에는 자동 적용되지 않습니다.
- 소량 배치의 실제 편입·검색 노출·한계는 [코퍼스 파일럿 기록](BookAppAI/evaluation/corpus_pilot_2026-11-11.md)에 있습니다.
- 실제 `HOLD` 재처리와 정보나루 자동 보강 결과는 [보류 도서 검증 기록](BookAppAI/evaluation/corpus_hold_enrichment_2026-11-11.md)에 있습니다.
- 기존 코퍼스가 검색 결과에 노출되는 방식과 로컬 `LEGACY` 3권 제외 근거는 [추천 노출 점검](BookAppAI/evaluation/legacy_search_audit_2026-11-11.md)에 있습니다.
- 기존 코퍼스의 유효하지 않은 ISBN은 `cd BookAppAI && python -m tools.repair_legacy_isbn --ids <로컬 ID 목록>`으로 먼저 검증하고, 결과를 확인한 뒤에만 `--apply`로 교정합니다. 로컬 13권의 출처 대조와 복구 매핑은 [ISBN 교정 기록](BookAppAI/evaluation/legacy_isbn_repair_2026-11-11.md)에 있습니다.
- SF 검색의 빈 대체 결과와 일반 소설 요청의 학교용 선집 우선 노출은 [추천 결과 품질 기록](BookAppAI/evaluation/search_result_quality_2026-11-11.md)에 재현·검증했습니다.
- 12개 대표 질의의 추천 품질 기준선과 사람 평가 절차는 [평가 기록](BookAppAI/evaluation/search_quality_review_2026-11-11.md)에 있습니다.
- 12개 질의의 최신 재평가와 일반 입문 검색의 학교 교육과정 도서, 장르별 대체 결과 점검은 [추천 품질 점검](BookAppAI/evaluation/recommendation_quality_audit_2026-11-11.md)에 있습니다.
- 일반 입문 검색에서 전문 교육용 책을 Gemini 후보와 대체 결과에서 제외한 검증은 [검색 품질 기록](BookAppAI/evaluation/fallback_quality_validation_2026-11-11.md)에 있습니다.
- 결과 상태를 함께 수집한 최신 12개 질의 재점검과 다른 작가 유사 검색 결과는 [추천 품질 재점검](BookAppAI/evaluation/search_quality_recheck_2026-11-12.md)에 있습니다.
- 추천 이유 누락의 재현 원인과 `LEGACY` 코퍼스 의존도는 [추천 품질 심층 점검](BookAppAI/evaluation/recommendation_depth_audit_2026-11-12.md)에 있습니다.
- 검색·필터·Gemini 입력·최종 선택의 `ACTIVE`/`LEGACY` 비율과 이유 누락 원인은 [단계별 검색 점검](BookAppAI/evaluation/search_stage_audit_2026-11-12.md)에 있습니다.
- 출처가 확인된 ISBN을 관리자 검토 후 소량 편입한 결과와 실제 검색 노출 한계는 [ISBN 편입 파일럿](BookAppAI/evaluation/curated_corpus_pilot_2026-11-12.md)에 있습니다.
- AI 분류 이후 승인 전 대기·보류·태그 교정의 실기동 검증은 [관리자 검토 게이트 기록](BookAppAI/evaluation/curated_review_gate_2026-11-12.md)에 있습니다.
- 검토 승인한 장르 도서가 검색 후보에 들어오도록 한 조정과 실제 추천 결과는 [승인 도서 검색 검증](BookAppAI/evaluation/reviewed_genre_retrieval_2026-11-12.md)에 있습니다.
- 기존 임베딩과 Gemini API를 같은 179권·10개 질의에서 비교한 결과는 [Gemini 임베딩 파일럿](BookAppAI/evaluation/gemini_embedding_pilot_2026-11-12.md)에, 달라진 후보 60건의 수동 판정은 [후속 적합도 평가](BookAppAI/evaluation/gemini_embedding_relevance_review_2026-11-12.md)에 있습니다. 운영 임베딩은 변경하지 않았습니다.
- 후보의 장르·형식·한국소설 조건을 보완한 뒤 같은 표본으로 다시 비교한 결과와 남은 국적 메타데이터 문제는 [후보 선별 및 임베딩 A/B 평가](BookAppAI/evaluation/search_candidate_constraints_ab_2026-11-12.md)에 있습니다.
- AI 검색: `POST /api/ai/search` (`X-Internal-Token` 필요, 개발 환경에서는 로컬 요청 허용). 본문은 책 배열이며 `X-Search-Outcome`, `X-Search-Reason`, `X-Search-Basis` 헤더로 결과 상태를 전달합니다.
- DB 스키마: FastAPI 시작 시 Alembic이 마이그레이션을 적용합니다. 첫 실행에는 DB DDL 권한이 필요합니다.
- 재태깅 대상 미리 보기: `python -m tools.queue_retag --limit 20` (`--apply`를 붙이면 큐에 등록)
- 실패한 태깅 작업 재등록: API 키/오류를 해결하고 AI 서버를 재시작한 뒤 `python -m tools.queue_retag --retry-failed --limit 20`으로 확인하고 `--apply`를 붙입니다.
- 검색 품질 샘플: `python -m tools.evaluate_search --url http://127.0.0.1:8000 --limit 5` (결과는 `/tmp/readonme-search-evaluation.json`). 요청 사이 기본 간격은 6초이며 결과에 요청 ID와 응답 시간이 기록됩니다. 알려진 오추천 사례는 `--cases evaluation/quality_cases.json --limit 5`로 확인합니다.
- 관리자 ISBN 편입: AI 워커 환경에 `LIBRARY_BIGDATA_API_KEY`를 설정한 뒤 `python -m tools.curated_corpus discover --kdc 8 --start-date 2026-01-01 --end-date 2026-10-31 --pages 1 3 5`로 정보나루 인기대출 후보를 조회하거나, `--library-keyword 한국소설 --pages 1 3`으로 도서 검색 후보를 조회합니다. 출처 URL과 ISBN을 적은 수동 목록은 `--isbn-file /tmp/candidates.json`으로 검증할 수 있습니다. 검토 결과는 `/tmp/readonme-curated-candidates.json`에 저장됩니다. `python -m tools.curated_corpus queue --manifest /tmp/readonme-curated-candidates.json --isbns <ISBN>`으로 미리 보고, 같은 명령에 `--apply`를 붙여 선택한 책만 검수 큐에 접수합니다. 짧지만 책 중심인 정보나루 소개를 사용하려면 해당 ISBN을 `--naru-isbns <ISBN>`에 지정합니다. AI 분류가 유효하면 작업은 `REVIEW_PENDING`이 되며 아직 검색 코퍼스에 들어가지 않습니다. `python -m tools.curated_corpus review --job-id <ID>`로 출처·소개·제안 태그를 확인한 뒤 `--decision approve --apply`로 승인하거나 `--decision hold --note '보류 이유' --apply`로 보류합니다. 태그를 교정해 승인하려면 `--decision approve --keyword SF --tags SF,소설,과학소설 --note '교정 근거' --apply`처럼 키워드·태그·근거를 함께 지정합니다. 승인은 임베딩을 생성하고 `ACTIVE`로 편입합니다. `QUEUED`와 `REVIEW_PENDING`은 편입 완료가 아닙니다.
- 추천: `GET /recommendations/{userId}`

### 3. React Native 앱 (`BookAppFront`)

```bash
cd BookAppFront
npm install
npx expo start
```

- `i` / `a` / `w`로 iOS, Android, Web 실행
- 린트: `npm run lint`
- 타입 검사: `npm run typecheck`
- 실제 기기 사용 시 `src/services/api.ts`의 호스트 주소를 로컬 네트워크 IP로 조정하세요.

### 4. (선택) Docker 이미지

```bash
docker build -t readonme-back BookAppBack
docker build -t readonme-ai BookAppAI
```

환경 변수는 컨테이너 실행 시 주입해야 합니다.

### 5. (권장) docker-compose로 전체 스택 실행

Postgres(pgvector) + Redis + Spring Boot + FastAPI를 한 번에 띄울 수 있습니다.

```bash
docker compose up --build
```

필수 환경변수/기본값은 `docs/environment-variables.md`에 정리되어 있습니다.

---

## 주요 API 요약

| 서비스 | 엔드포인트 | 설명 |
| --- | --- | --- |
| Spring | `POST /api/users/signup`, `/signin`, `GET /profile` | 회원 관리 및 JWT 인증 |
| Spring | `GET /api/books/search`, `/detail/{isbn}`, `/popular`, `/books/{isbn}/editions` | 카카오 기반 도서 조회 |
| Spring | `POST /api/library/{bookId}?status=READING`, `GET /api/library`, `GET /api/library/all` | 개인/전체 서재 관리 및 추천용 데이터 |
| Spring | `POST /api/books/{bookId}/review`, `POST /api/books/review/{id}/like`, `GET /api/books/{bookId}/reviews` | 리뷰/좋아요/조회 |
| Spring | `GET /api/notifications/stream`, `GET /api/notifications` | SSE 알림 스트림 및 목록 |
| Spring | `POST /api/ai/jobs`, `GET /api/ai/jobs/{id}`, `GET /api/ai/jobs/recent` | 로그인 사용자별 AI 검색 접수·상태·24시간 결과 조회 |
| Spring → FastAPI | `POST /api/ai/search` | 기존 동기 응답 형식 유지, 비동기 WebClient로 FastAPI 호출 |
| FastAPI | `POST /api/books/fetch-and-filter`, `GET /api/books/ingestion-runs/{id}` | 관리자 키워드 배치 접수와 진행 상태 |
| FastAPI | `POST /api/books/embed-single`, `GET /api/books/ingestion-jobs/{id}` | 서재 도서 수집 접수와 개별 검수 상태 |
| FastAPI | `POST /api/ai/search` | 자연어 + 벡터 검색 |
| FastAPI | `GET /recommendations/{userId}` | 협업 필터링 추천 |

---

## 개발 팁

- FastAPI에서 SentenceTransformer가 로딩되므로 모델/환경 변수를 바꿀 때는 서버 재시작이 필요합니다.
- AI 검색은 한 Spring 인스턴스에서 실행 2건과 대기 10건으로 제한합니다. 대기열이 가득 차면 `503`과 `Retry-After: 5`를 반환합니다. 재시작 시 대기 작업은 재개하고 실행 중이던 작업은 실패로 표시합니다.
- 앱은 AI 검색 화면이 열려 있는 동안 작업 상태를 3초마다 확인하고, 화면을 다시 열면 저장된 작업 ID로 최근 24시간 작업을 복원합니다. 접수 요청의 `Idempotency-Key`를 재사용하면 중복 작업을 만들지 않습니다. 후보 비교는 기존 추천 이유와 책 소개의 근거를 보여주며 별도 AI 비교 호출은 하지 않습니다.
- AI 검색은 규칙 기반 의도 분석 뒤 벡터 30건과 키워드 20건을 합치고, 세부 장르를 명시한 경우 제목이 일치하는 후보를 최대 20건 더 확인합니다. 주제·장르의 근거를 제목과 책 소개에서 검증하고 장르 해설서·학습 자료·여러 권 묶음 세트를 제외하므로 결과가 5권보다 적을 수 있습니다. Gemini 장애 시 이야기형 요청의 대체 결과는 서사 근거가 있는 후보를 사용하고, 명시한 세부 장르에서는 장르·소설 근거가 검증된 후보도 사용할 수 있습니다. 명시한 저자는 정확히 일치하는 책으로 제한합니다. 저자 작품과 비슷한 책 요청은 코퍼스의 해당 저자 작품을 기준으로 다른 저자의 책을 찾습니다. 이 요청의 대체 결과는 작가와 무관하게 기준 작품과 공통 주제 2개 이상 및 작품 근거가 확인된 책만 사용합니다. 기준 작품이 없으면 빈 결과를 반환합니다.
- 이야기·분위기를 원하는 질문에서는 책 소개에 드러난 실용서 신호를 확인해 명확한 가이드만 제외합니다. 형식이 불분명한 책은 후보에 남깁니다. 상위 후보 10권의 책 중심 소개를 Gemini에 전달하고 재정렬을 최대 1회 호출합니다. 추천 이유는 모델이 인용한 문구가 전달한 소개에 실제로 있는 경우에만 표시합니다. 모델이 적합한 후보가 없다고 판단하면 빈 결과를 반환합니다. 호출 또는 응답 검증이 실패하면 이야기형 요청은 서사 근거 또는 명시한 세부 장르의 검증된 근거가 있는 후보만, 다른 요청은 기존 순서의 후보를 최대 5권까지 이유 없이 반환하고 `ranking_status=FALLBACK`을 표시합니다. 일반 소설 요청에서는 학교용 선집을 단행본보다 뒤에 배치합니다. 검색 작업은 `MODEL`, `FALLBACK`, `NO_MATCH`, `DEGRADED_EMPTY`를 별도 저장합니다. 마지막 상태는 Gemini 장애 중 검증된 대체 결과도 없음을 뜻하며, 앱은 같은 조건 재시도를 안내합니다. 429 뒤에는 60초, 연속 503·시간 초과 두 번 뒤에는 30초간 Gemini 호출을 잠시 멈춥니다.
- 검색에 쓰는 SentenceTransformer 추론은 단일 작업자로 직렬화합니다. 코퍼스 수집은 PostgreSQL 작업 큐에서 한 번에 한 후보씩 처리합니다. 일반 일시 오류는 최대 3회, API 호출 제한은 긴 간격으로 계속 재시도하며 Gemini 쿨다운 중에는 새 작업을 처리하지 않습니다. 기존 `book_tagging_jobs` 재태깅 워커는 별도로 동작합니다. Spring 시작 시 코퍼스를 자동 수집하지 않으며, 사용자가 서재에 새 책을 저장하면 AI 수집 작업에 접수합니다. 수집 품질 검사 결과와 관계없이 서재 저장은 유지됩니다.
- `BookAppAI/evaluation/golden_queries.json`의 40개 질의는 의도 분석 회귀 테스트에 쓰입니다. `quality_cases.json`은 알려진 오추천 사례와 실용서·저자 유사성 대조 질의를 담습니다. 평가 스크립트는 금지 제목, 이야기형 질문의 실용서 혼입, 추천 이유 근거 여부를 기록합니다. `grounded_reason`이 `null`이면 추천 이유가 없고 `false`이면 이유가 있지만 근거를 확인하지 못한 것입니다. 실제 관련성 점수는 결과의 **각 책**에 있는 `human_relevance_1_to_5`에 직접 기록합니다. 결과 파일의 `contents_excerpt`와 추천 이유를 함께 보고 판단하세요.
- SSE 연결은 1시간 타임아웃으로 유지됩니다. 앱에서 로그아웃 시 EventSource를 닫아야 리소스 누수가 없습니다.
- Android 에뮬레이터는 `10.0.2.2`, iOS 시뮬레이터는 `localhost`를 사용합니다. 실제 기기는 로컬 IP 또는 터널을 사용하세요.

---

## 테스트 & 검증

- **Spring Boot** (`BookAppBack/`): `./gradlew test --rerun-tasks`
- **FastAPI** (`BookAppAI/`): `pip install -r requirements-test.txt` 후 `python -m pytest -q`
- **React Native** (`BookAppFront/`): `npm run lint -- --max-warnings 0`, `npm run typecheck`
- GitHub Actions는 PR과 `main` 푸시에서 위 자동 검사를 실행합니다. 외부 API 키는 필요하지 않습니다.
- 수동 확인
  - `GET http://localhost:8080/api/books/test` → Spring 작동 여부
  - `GET http://localhost:8000/test-spring-connection` → FastAPI ↔ Spring 통신 검사
  - 앱 홈에서 AI 사서 열기 → 조건 입력 → `대기 중 → 검색 중 → 완료/실패` 확인 → 두 후보 비교 → 한 권 선택
  - 리뷰 좋아요 → SSE 알림 도착 여부 확인

세 서비스를 동시에 실행하면 회원가입 후 책 검색, 서재 등록, 리뷰 작성, AI 책 선택, 알림 수신까지 전체 흐름을 체험할 수 있습니다.
