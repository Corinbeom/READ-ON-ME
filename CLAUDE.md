# CLAUDE.md — READ-ON-ME AI 협업 규칙

이 파일은 Claude Code와 이 프로젝트를 함께 작업할 때 지켜야 할 규칙과 컨텍스트를 정의한다.

---

## 프로젝트 구조

```
READ-ON-ME/
├── BookAppBack/    Spring Boot 3 · Java 17 · Gradle (포트 8080)
├── BookAppAI/      FastAPI · Python 3.12          (포트 8000)
├── BookAppFront/   React Native · Expo · TypeScript
├── docker-compose.yml
└── docs/
```

### BookAppBack 패키지 구조
```
bookapp.bookappback.
  ai/           AiSearchController, AiSearchService, AiRecommendationService
  book/         BookController, BookService, KakaoBookService, LibraryApiService
  user/         UserController, UserService
  review/       BookReviewController, BookReviewService
  notification/ NotificationController, NotificationService (SSE + Redis)
  recommendation/ RecommendationService (CF + pgvector RRF)
  userbookstatus/ 서재 상태 관리
  common/       ApiResponse, GlobalExceptionHandler, RateLimitFilter
  config/       Security, JWT, Redis, CORS, Swagger
  security/     JwtAuthenticationFilter, UserDetailsImpl
```

### BookAppAI 패키지 구조
```
app/
  main.py               FastAPI 앱 엔트리포인트
  database.py           async SQLAlchemy 엔진
  schemas.py            Pydantic 모델
  models/               book_corpus SQLAlchemy 모델
  routers/
    data_builder.py     /api/books/fetch-and-filter, /embed-single
    recommendation.py   /api/ai/search, content-based
  services/
    book_ai_service.py  핵심 오케스트레이터 (임베딩, 검색, 저장)
    gemini_tagger.py    Gemini 태깅
    intent_classifier.py 쿼리 의도 분석
    keyword_expander.py 키워드 확장
    query_rewriter.py   쿼리 재작성
    reranker.py         Gemini 재순위화
    text_utils.py       텍스트 전처리
    user_profile_service.py 협업 필터링용 유저 프로파일
```

---

## 실행 방법

```bash
# 전체 스택 (권장)
docker compose up --build

# Spring Boot만
cd BookAppBack && ./gradlew bootRun

# FastAPI만
cd BookAppAI && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# 프론트만
cd BookAppFront && npx expo start
```

---

## 코드 작업 규칙

### 공통
- 작업 전 반드시 관련 파일을 먼저 읽는다. 파일을 읽지 않고 편집하지 않는다.
- 테스트가 존재하는 경로에 새 기능을 추가할 때는 테스트도 함께 작성한다.
- 주석은 "왜(Why)"가 비명백한 경우에만 단 한 줄 작성한다.
- 환경 변수는 `.env`에서 읽는다. 값을 코드에 하드코딩하지 않는다.

### Java / Spring Boot
- 응답 포맷은 `ApiResponse<T>` 래퍼를 반드시 사용한다.
- 예외는 `BookExceptions`, `ReviewExceptions` 등 도메인별 중첩 클래스 방식을 따른다. 새 도메인 예외는 같은 패턴으로 추가한다.
- `AiSearchService`에서 `.block()` 을 **절대 추가하지 않는다**. (PRD P0 이슈) 이 메서드는 논블로킹으로 전환 예정이다.
- 데이터베이스 스키마 변경은 `src/main/resources/db/migration/`에 Flyway SQL 파일로 추가한다. JPA `ddl-auto=update`는 사용하지 않는다.
- `@Transactional` 어노테이션은 서비스 계층에만 붙인다. 컨트롤러에는 붙이지 않는다.

### Python / FastAPI
- 모듈 레벨에서 무거운 모델(`SentenceTransformer`)을 즉시 로드하지 않는다. `lifespan` 이벤트 핸들러나 의존성 주입으로 처리한다.
- `print()` 대신 `logging` 모듈을 사용한다. 새 코드에 `print()` 를 추가하지 않는다.
- DB 마이그레이션은 `Base.metadata.create_all()` 대신 Alembic을 도입할 예정이다. 스키마 변경 시 Alembic 마이그레이션 파일을 함께 생성한다.
- `async def`로 선언된 함수 안에서 동기 블로킹 I/O(`requests`, `time.sleep` 등)를 호출하지 않는다.

### TypeScript / React Native
- API 호출은 `src/services/api.ts`에 집중한다. 컴포넌트에서 직접 fetch 하지 않는다.
- 상태 관리는 Redux Toolkit slice(`src/store/`)를 사용한다.
- 스타일은 `src/styles/` 또는 `components/styles/`에 분리한다.

---

## 알려진 기술 부채 (PRD 참고)

작업 중 아래 항목과 관련된 코드를 만나면 개선이 필요함을 인지하고, 기존 동작을 깨뜨리지 않는 범위에서만 수정한다. 무단으로 대규모 리팩토링을 시작하지 않는다.

| 위치 | 문제 | PRD 우선순위 |
|------|------|------------|
| `AiSearchService.java:43` | `.block()` 사용 | P0 |
| `NotificationService.java:36` | SSE 이미터 JVM 인메모리 | P0 |
| `book_ai_service.py` (모듈 top) | SentenceTransformer 즉시 로드 | P0 |
| `RecommendationService.java:47` | 전체 서재 메모리 적재 | P1 |
| `BookAppAI/app/database.py` | Alembic 없음 | P1 |
| Python 전체 | `print()` 로깅 | P2 |

---

## 테스트 실행

```bash
# Spring Boot
cd BookAppBack && ./gradlew test

# FastAPI
cd BookAppAI && source .venv/bin/activate && pytest

# Frontend lint
cd BookAppFront && npm run lint
```

테스트 없이 PR을 만들지 않는다. 새 서비스/라우터 추가 시 최소 1개의 통합 테스트를 포함한다.

---

## 환경 변수 참고

각 서비스 디렉터리의 `.env` 파일과 `docs/environment-variables.md`를 참고한다. 민감한 키(JWT_SECRET, KAKAO_API_KEY, GEMINI_API_KEY, INTERNAL_API_TOKEN)는 절대 코드에 커밋하지 않는다.

---

## 커밋 컨벤션

```
feat(scope): 새 기능
fix(scope): 버그 수정
refactor(scope): 동작 변경 없는 코드 개선
test(scope): 테스트 추가/수정
chore(scope): 빌드/설정 변경
```

scope 예시: `backend`, `ai`, `frontend`, `infra`, `review`, `notification`

---

## Claude에게 — 작업 시 체크리스트

1. 파일을 수정하기 전에 반드시 먼저 읽는다.
2. 변경 범위가 1개 파일을 넘으면 어떤 파일을 바꿀지 먼저 설명한다.
3. DB 스키마 변경이 포함되면 마이그레이션 파일도 함께 제안한다.
4. 새 환경 변수가 필요하면 `docs/environment-variables.md`와 `docker-compose.yml`도 업데이트한다.
5. Python 코드에 `print()` 를 추가하지 않는다.
6. `.block()` 패턴을 확대하지 않는다.
7. 기존 테스트가 깨지면 반드시 함께 수정한다.
8. 커밋 메시지는 한국어 또는 영어 컨벤션 형식을 지킨다.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
