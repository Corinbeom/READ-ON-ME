## READ-ON-ME 환경변수 가이드 (docker-compose 기준)

이 문서는 `docker-compose.yml`로 전체 스택(Postgres+pgvector, Redis, Spring Boot, FastAPI)을 실행하기 위해 필요한 환경변수를 정리합니다.

### 필수

- **KAKAO_API_KEY**: 카카오 도서 검색 API 키 (Spring/AI 모두 사용)
- **GEMINI_API_KEY**: Gemini 태깅/분류용 키 (AI 사용)
- **INTERNAL_API_TOKEN**: Spring ↔ AI 내부 통신용 토큰 (예: `/api/library/all` 보호)

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
FastAPI: `http://localhost:8000`

### 주의: pgvector 확장(vector 타입) 초기화

AI 워커는 `VECTOR` 타입을 사용하므로 Postgres에 `pgvector` 확장이 활성화되어 있어야 합니다.

- 이 레포는 `docker/postgres/init/01-enable-pgvector.sql`을 통해 **새로 생성되는 DB**에서 자동으로 `CREATE EXTENSION vector;`를 수행합니다.
- 이미 `readonme_pgdata` 볼륨이 생성된 상태라면 초기화 스크립트가 다시 실행되지 않을 수 있으니, 아래 중 하나를 선택하세요.
  - **(권장, 데이터 삭제됨)**: `docker compose down -v` 후 `docker compose up --build`
  - **(데이터 유지)**: Postgres에 접속해 `CREATE EXTENSION vector;`를 1회 실행


