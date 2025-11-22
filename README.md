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
   - `/api/ai/search` 요청을 WebClient로 FastAPI에 전달하고, AI 추천에 필요한 모든 유저의 서재 데이터를 `/api/library/all`에서 노출합니다.

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
- 데이터 빌드: `POST /api/books/fetch-and-filter` (키워드 배열 전달)
- 단일 도서 임베딩: `POST /api/books/embed-single`
- AI 검색: `POST /api/ai/search`
- 추천: `GET /recommendations/{userId}`

### 3. React Native 앱 (`BookAppFront`)

```bash
cd BookAppFront
npm install
npx expo start
```

- `i` / `a` / `w`로 iOS, Android, Web 실행
- 린트: `npm run lint`
- 실제 기기 사용 시 `src/services/api.ts`의 호스트 주소를 로컬 네트워크 IP로 조정하세요.

### 4. (선택) Docker 이미지

```bash
docker build -t readonme-back BookAppBack
docker build -t readonme-ai BookAppAI
```

환경 변수는 컨테이너 실행 시 주입해야 합니다.

---

## 주요 API 요약

| 서비스 | 엔드포인트 | 설명 |
| --- | --- | --- |
| Spring | `POST /api/users/signup`, `/signin`, `GET /profile` | 회원 관리 및 JWT 인증 |
| Spring | `GET /api/books/search`, `/detail/{isbn}`, `/popular`, `/books/{isbn}/editions` | 카카오 기반 도서 조회 |
| Spring | `POST /api/library/{bookId}?status=READING`, `GET /api/library`, `GET /api/library/all` | 개인/전체 서재 관리 및 추천용 데이터 |
| Spring | `POST /api/books/{bookId}/review`, `POST /api/books/review/{id}/like`, `GET /api/books/{bookId}/reviews` | 리뷰/좋아요/조회 |
| Spring | `GET /api/notifications/stream`, `GET /api/notifications` | SSE 알림 스트림 및 목록 |
| Spring → FastAPI | `POST /api/ai/search` | WebClient로 FastAPI 호출 |
| FastAPI | `POST /api/books/fetch-and-filter`, `POST /api/books/embed-single` | 백그라운드 데이터 빌드 |
| FastAPI | `POST /api/ai/search` | 자연어 + 벡터 검색 |
| FastAPI | `GET /recommendations/{userId}` | 협업 필터링 추천 |

---

## 개발 팁

- FastAPI에서 SentenceTransformer가 로딩되므로 모델/환경 변수를 바꿀 때는 서버 재시작이 필요합니다.
- AI 빌더는 Gemini API를 두 번 호출(빠른 모델 + 상세 모델)하므로 호출 제한을 고려하세요.
- SSE 연결은 1시간 타임아웃으로 유지됩니다. 앱에서 로그아웃 시 EventSource를 닫아야 리소스 누수가 없습니다.
- Android 에뮬레이터는 `10.0.2.2`, iOS 시뮬레이터는 `localhost`를 사용합니다. 실제 기기는 로컬 IP 또는 터널을 사용하세요.

---

## 테스트 & 검증

- **Spring Boot**: `./gradlew test`
- **FastAPI**: `pytest`
- **React Native**: `npm run lint`
- 수동 확인
  - `GET http://localhost:8080/api/books/test` → Spring 작동 여부
  - `GET http://localhost:8000/test-spring-connection` → FastAPI ↔ Spring 통신 검사
  - 앱에서 AI 챗 질문 → FastAPI `/api/ai/search` 로그와 응답 확인
  - 리뷰 좋아요 → SSE 알림 도착 여부 확인

세 서비스를 동시에 실행하면 회원가입 후 책 검색, 서재 등록, 리뷰 작성, AI 추천 대화, 알림 수신까지 전체 흐름을 체험할 수 있습니다.
