## READ-ON-ME

책을 좋아하는 사용자를 위한 AI 기반 독서 동반자 서비스입니다. React Native(Expo) 앱, Spring Boot 백엔드, FastAPI AI 워커가 함께 동작하며 카카오 도서 검색, 개인 서재 관리, 리뷰·알림, 자연어 기반 AI 추천을 지원합니다.

### 리포지토리 구조

| 경로 | 설명 | 주요 기술 |
| --- | --- | --- |
| `BookAppFront/` | Expo Router 기반 모바일 앱. 로그인/라이브러리/리뷰/알림/AI 챗 UI 제공. | React Native 0.81, Expo 54, TypeScript |
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
- **AI 챗 추천**: 자연어 쿼리를 FastAPI에 전달해 키워드+벡터 기반 추천, 다시 추천 요청/도서 상세 이동 지원.
- **추천 데이터 빌더**: 키워드로 카카오 데이터를 모아 필터링/태깅/임베딩 후 백그라운드 삽입.
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
- 데이터 빌드: `POST /api/books/fetch-and-filter` (키워드 배열 전달)
- 단일 도서 임베딩: `POST /api/books/embed-single` (저장 또는 중복 판정을 마친 뒤 `status` 반환; 실패 시 오류 응답)
- AI 검색: `POST /api/ai/search` (`X-Internal-Token` 필요, 개발 환경에서는 로컬 요청 허용)
- DB 스키마: FastAPI 시작 시 Alembic이 마이그레이션을 적용합니다. 첫 실행에는 DB DDL 권한이 필요합니다.
- 재태깅 대상 미리 보기: `python -m tools.queue_retag --limit 20` (`--apply`를 붙이면 큐에 등록)
- 실패한 태깅 작업 재등록: API 키/오류를 해결하고 AI 서버를 재시작한 뒤 `python -m tools.queue_retag --retry-failed --limit 20`으로 확인하고 `--apply`를 붙입니다.
- 검색 품질 샘플: `python -m tools.evaluate_search --url http://127.0.0.1:8000 --limit 5` (결과는 `/tmp/readonme-search-evaluation.json`). 알려진 오추천 사례는 `--cases evaluation/quality_cases.json --limit 5`로 확인합니다.
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
| FastAPI | `POST /api/books/fetch-and-filter`, `POST /api/books/embed-single` | 백그라운드 데이터 빌드 / 완료를 확인하는 단일 도서 임베딩 |
| FastAPI | `POST /api/ai/search` | 자연어 + 벡터 검색 |
| FastAPI | `GET /recommendations/{userId}` | 협업 필터링 추천 |

---

## 개발 팁

- FastAPI에서 SentenceTransformer가 로딩되므로 모델/환경 변수를 바꿀 때는 서버 재시작이 필요합니다.
- AI 검색은 한 Spring 인스턴스에서 실행 2건과 대기 10건으로 제한합니다. 대기열이 가득 차면 `503`과 `Retry-After: 5`를 반환합니다. 재시작 시 대기 작업은 재개하고 실행 중이던 작업은 실패로 표시합니다.
- 앱은 AI 검색 상태를 3초마다 확인하고 화면을 다시 열면 최근 24시간 작업을 복원합니다. 접수 요청의 `Idempotency-Key`를 재사용하면 중복 작업을 만들지 않습니다.
- AI 검색은 규칙 기반 의도 분석 뒤 벡터 30건과 키워드 20건을 합치고, 세부 장르를 명시한 경우 제목이 일치하는 후보를 최대 20건 더 확인합니다. 주제·장르의 근거를 제목과 책 소개에서 검증하고 장르 해설서·학습 자료를 제외하므로 결과가 5권보다 적을 수 있습니다. 명시한 저자는 정확히 일치하는 책으로 제한합니다. 저자 작품과 비슷한 책 요청은 코퍼스의 해당 저자 작품을 기준으로 다른 저자의 책을 찾습니다. 기준 작품이 없으면 빈 결과를 반환합니다.
- 이야기·분위기를 원하는 질문에서는 책 소개에 드러난 실용서 신호를 확인해 명확한 가이드만 제외합니다. 형식이 불분명한 책은 후보에 남깁니다. 상위 후보 10권의 책 중심 소개를 Gemini에 전달하고 재정렬을 최대 1회 호출합니다. 추천 이유는 모델이 인용한 문구가 전달한 소개에 실제로 있는 경우에만 표시합니다. 모델이 적합한 후보가 없다고 판단하면 빈 결과를 반환합니다. 호출 또는 응답 검증이 실패하면 기존 순서 최대 5권을 이유 없이 반환하고 `ranking_status=FALLBACK`을 표시합니다.
- 검색에 쓰는 SentenceTransformer 추론은 단일 작업자로 직렬화합니다. 데이터 빌드는 한 번에 한 작업만 받고 책마다 저장합니다. Gemini 태깅이 실패한 도서는 DB 작업 큐에 기록하며 30초 간격으로 한 권씩 재시도합니다. 429는 긴 간격으로 계속 재시도하고, 인증 오류는 수동 재등록을 기다립니다. 실행 중단 후 2분간 갱신되지 않은 작업은 다시 대기열로 옮깁니다.
- `BookAppAI/evaluation/golden_queries.json`의 40개 질의는 의도 분석 회귀 테스트에 쓰입니다. `quality_cases.json`은 알려진 오추천 사례와 실용서·저자 유사성 대조 질의를 담습니다. 평가 스크립트는 금지 제목, 이야기형 질문의 실용서 혼입, 추천 이유 근거 여부를 기록합니다. 실제 관련성 점수는 결과의 `human_relevance_1_to_5`에 직접 기록해야 합니다.
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
  - 앱에서 AI 챗 질문 → `대기 중 → AI 사서가 서재에서 책을 찾는 중 → 완료/실패` 확인
  - 리뷰 좋아요 → SSE 알림 도착 여부 확인

세 서비스를 동시에 실행하면 회원가입 후 책 검색, 서재 등록, 리뷰 작성, AI 추천 대화, 알림 수신까지 전체 흐름을 체험할 수 있습니다.
