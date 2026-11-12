## READ-ON-ME 환경변수 가이드 (docker-compose 기준)

이 문서는 `docker-compose.yml`로 전체 스택(Postgres+pgvector, Redis, Spring Boot, FastAPI)을 실행하기 위해 필요한 환경변수를 정리합니다.

### 필수

- **KAKAO_API_KEY**: 카카오 도서 검색 API 키 (Spring/AI 모두 사용)
- **GEMINI_API_KEY**: Gemini 태깅/분류용 키 (AI 사용)
- **INTERNAL_API_TOKEN**: Spring ↔ AI 내부 통신용 토큰. Spring의 `/api/library/all`과 FastAPI의 검색·데이터 구축·독서 태그·협업 추천 API에 동일하게 설정합니다.

Gemini 태깅과 검색 재정렬의 기본 모델은 `gemini-3.5-flash-lite`입니다. 필요하면 AI 서비스의 `GEMINI_FAST_MODEL`, `GEMINI_DETAILED_MODEL`, `GEMINI_CLASSIFIER_MODEL`로 각각 변경할 수 있습니다. 모델을 바꾼 뒤에는 AI 서버를 재시작해야 합니다.

임베딩 제공자는 AI 서비스의 `EMBEDDING_PROVIDER`로 선택합니다. 기본값 `local`은 기존 SentenceTransformer와 `embedding` 열을 사용합니다. `gemini`는 `gemini-embedding-001`의 768차원 벡터를 `gemini_embedding` 열에 저장하고 검색합니다. `GEMINI_EMBEDDING_TIMEOUT_SECONDS`의 기본값은 5초입니다. Gemini 모드에서 임베딩 요청이 실패하면 검색은 `503`을 반환하고 도서 편입 작업은 기존 재시도 정책을 따릅니다. Docker 빌드 인자에도 같은 제공자를 전달하므로 Gemini 모드의 이미지에는 로컬 모델 패키지를 설치하지 않습니다. 제공자를 바꿀 때는 이미지를 다시 빌드해야 합니다.

AI 코퍼스 수집의 `CORPUS_SIMILARITY_THRESHOLD` 기본값은 `0.45`입니다. 카카오 키워드 후보가 주제 프롬프트와 이 값보다 낮은 유사도를 보이면 Gemini 분류 전에 제외합니다. 사용자 서재에서 추가한 책에는 이 키워드 필터를 적용하지 않습니다. 데이터 수집은 서버 시작 시 자동 실행되지 않으며 내부 토큰으로 보호된 `POST /api/books/fetch-and-filter`를 호출해야 합니다.

`GEMINI_CLASSIFIER_MIN_INTERVAL_SECONDS` 기본값은 `6`입니다. 같은 AI 프로세스의 도서 분류 요청 사이에 최소 간격을 두어 호출량을 낮춥니다. 여러 AI 프로세스가 동시에 실행되는 경우 이 간격은 프로세스마다 적용됩니다.

### 권장(운영/보안)

- **JWT_SECRET**: JWT 서명 키 (기본값은 예시이므로 반드시 변경 권장)
- **JWT_EXPIRED**: JWT 만료(ms)
- **CORS_URL**: 허용할 Origin (예: `http://localhost:8081`)

### DB/Redis (기본값 제공됨)

docker-compose 기본값으로도 실행되지만, 필요 시 오버라이드할 수 있습니다.

- **POSTGRES_DB** (default: `readonme`)
- **POSTGRES_USER** (default: `readonme`)
- **POSTGRES_PASSWORD** (default: `readonme`)
- **SPRING_DB_URL** (default: `jdbc:postgresql://postgres:5432/readonme`)
- **AI_DATABASE_URL** (default: `postgresql+asyncpg://readonme:readonme@postgres:5432/readonme`)
- **REDIS_URL** (default: `redis://redis:6379`)

### 서비스 간 통신

- **AI_BASE_URL** (default: `http://ai:8000`) - Spring → FastAPI
- **SPRING_BOOT_URL** (default: `http://backend:8080`) - FastAPI → Spring

### 실행

프로젝트 루트에서:

```bash
docker compose up --build
```

Spring: `http://localhost:8080`  
FastAPI: `http://localhost:8000` (Docker 호스트에서는 `127.0.0.1`에만 바인딩)

### DB 마이그레이션과 재태깅

FastAPI 시작 시 Alembic이 `book_corpus`, `book_tagging_jobs`, `corpus_ingestion_jobs` 스키마를 확인합니다. 기존 코퍼스는 `LEGACY`로 유지되어 검색되며 새 책만 새 검수 절차를 거칩니다. 새 DB에는 `vector` 확장을 생성할 권한이 필요합니다. 코퍼스 수집의 일반 일시 오류는 최대 3회 재시도하며, 호출 제한은 최대 6시간 간격으로 계속 재시도합니다. 인증 오류는 즉시 실패합니다. 기존 재태깅 작업은 별도 큐에 남습니다. 재태깅 인증 오류를 해결한 뒤에는 AI 서버를 재시작하고 `BookAppAI`에서 `python -m tools.queue_retag --retry-failed --limit 20`으로 미리 보고 `--apply`로 다시 등록하세요.

### Gemini 임베딩 전환

기존 코퍼스는 두 제공자의 벡터 공간을 섞지 않도록 별도 열을 채운 뒤 전환합니다. 기존 `embedding` 열은 유지됩니다.

1. AI 서비스에 `GEMINI_API_KEY`를 설정한 상태에서 `cd BookAppAI && alembic upgrade head`로 `gemini_embedding` 열을 추가합니다. 이 단계에서는 `EMBEDDING_PROVIDER=local`을 유지합니다.
2. `python -m tools.backfill_gemini_embeddings`로 대상·누락 건수를 확인하고, `python -m tools.backfill_gemini_embeddings --apply`로 `ACTIVE`/`LEGACY` 책을 채웁니다. 도구는 최대 8권씩 묶어 호출하고 책마다 저장하므로 호출 제한·네트워크 오류가 나면 같은 명령으로 이어서 실행할 수 있습니다. `--limit`, `--batch-size`, `--pace`로 한 번의 작업량과 호출 간격을 조정할 수 있습니다.
3. 다시 보고 명령을 실행해 `missing=0`을 확인한 뒤 `EMBEDDING_PROVIDER=gemini`로 AI 서버를 재시작합니다. 누락된 검색 가능 책이 있으면 서버가 시작을 거부합니다. 신규 도서는 선택한 제공자의 열에만 벡터가 저장됩니다.

기존 로컬 벡터는 전환 후에도 보존됩니다. 다만 Gemini 전환 이후 들어온 새 책에는 로컬 벡터가 없으므로, 로컬 모드로 되돌리려면 그 책의 로컬 벡터를 별도로 채워야 합니다.

### 주의: pgvector 확장(vector 타입) 초기화

AI 워커는 `VECTOR` 타입을 사용하므로 Postgres에 `pgvector` 확장이 활성화되어 있어야 합니다.

- 이 레포는 `docker/postgres/init/01-enable-pgvector.sql`을 통해 **새로 생성되는 DB**에서 자동으로 `CREATE EXTENSION vector;`를 수행합니다.
- 이미 `readonme_pgdata` 볼륨이 생성된 상태라면 초기화 스크립트가 다시 실행되지 않을 수 있으니, 아래 중 하나를 선택하세요.
  - **(권장, 데이터 삭제됨)**: `docker compose down -v` 후 `docker compose up --build`
  - **(데이터 유지)**: Postgres에 접속해 `CREATE EXTENSION vector;`를 1회 실행


