# 웹 베타 배포 기록 (준비 2026-11-15 / 배포 2026-11-16)

## 배포 환경

- 웹: https://read-on-me-beta.pages.dev (Cloudflare Pages 정적 호스팅)
- API: https://152.67.222.15 (Let's Encrypt 공개 IP 인증서, Caddy 자동 갱신)
- 최초 배포 검증 완료본: `4045fd26`, https://4045fd26.read-on-me-beta.pages.dev
- 후속 UI 수정 배포: `96bb7915`, https://96bb7915.read-on-me-beta.pages.dev ([타이핑·화면 규격 검증](home-animation-tab-layout-2026-11-16.md))
- Oracle 춘천 E2.1.Micro 1대, Ubuntu 24.04.5, RAM 952MiB, 2GB 스왑. 유료 리소스는 생성하지 않았다.
- `/opt/readonme/compose.beta.yml`: Spring·FastAPI·pgvector PostgreSQL 16·Redis·Caddy. AI 검색 동시 실행 1건.
- 이미지: `readonme-back:beta-20261116`, `readonme-ai:beta-20261115`. VM에서 빌드하지 않고 로컬 빌드 이미지를 전송했다. AI 이미지에는 torch·sentence-transformers·개발 `.env`를 포함하지 않는다.
- 배포·웹 접근 통제·탭 UI 변경은 `feat/mobile-web-beta`에서 관리한다. main 병합은 별도로 진행한다.

## 데이터와 접근 통제

- 개발 DB에서 `book_corpus` 1,003권만 명시적 열 목록의 CSV COPY로 이전했다. ACTIVE 17권·LEGACY 956권은 모두 Gemini 임베딩이 있고, DISABLED 30권은 검색 대상에서 제외된다.
- 개발 사용자·기존 서재·리뷰는 복사하지 않았다. 배포 검증용 계정은 새로 만들고 무작위 강한 비밀번호를 사용했다. 계정 자격 증명은 공개 문서에 남기지 않는다.
- DB 비밀번호·JWT 비밀값·내부 API 토큰은 새로 생성했다. `.env`와 SSH 개인 키는 Git과 이미지에 포함하지 않는다.
- 공개 포트는 HTTPS/HTTP, SSH는 관리자 IP 제한. Spring은 호스트 loopback, DB·Redis·AI는 Docker 내부 네트워크에서 접근한다.
- 프록시에서 `/api/library/all`, actuator·Swagger 경로를 차단한다. AI 검색은 로그인해야 하며 사용자별 분당 20회 제한을 적용한다. 조회 폴링에는 이 한도를 적용하지 않는다.
- Redis 확인 실패 시 검색 접수는 503과 Retry-After를 반환한다. 익명 도서 검색은 연결 IP를 사용하므로 프록시 뒤 익명 요청은 한도를 공유할 수 있다.

## 실제 API 검증

외부에서 인증서를 정상 검증하는 HTTP 클라이언트로 실행했다. 목 응답과 인증서 검증 우회를 사용하지 않았다.

| 항목 | 결과 |
| --- | --- |
| HTTPS API 연결 | `/api/books/test` 200, IP SAN과 Let's Encrypt 발급자 확인 |
| 내부 경로 차단 | `/api/library/all`, `/actuator/health` 외부 404 |
| 익명 AI 요청 | 403으로 거부 |
| 사용자별 요청 제한 | 완료된 작업에 같은 키로 20회 재접수 후 21번째 429·Retry-After 60. 상태 조회는 계속 200. 추가 모델 호출 없음 |
| 웹 CORS 사전 요청 | 정확한 Pages origin에 200과 허용 헤더 |
| 새 계정 가입·로그인·프로필 | 모두 200 |
| 인기 도서 조회 | 정보나루 초기 수집 70건(7개 연령 그룹), 전체 그룹 조회 10권 |
| 카카오 검색 | `1984` 검색 3권 반환 |
| 실제 AI 추천 | `SF 소설 추천해줘` 접수 202 → QUEUED → RUNNING → SUCCEEDED |
| AI 응답 품질 | 약 14.6초, MODEL 결과 5권, 추천 이유 5건 |

## 공개 웹 브라우저 검증

390×844 Chromium에서 정상 로그인 → 홈 → AI 검색 → 두 권 비교 → 『당신 인생의 이야기』 선택 → 책 상세 → 읽고 싶어요 저장 → 서재 직접 접속 후 1권 표시를 확인했다. 최종 재배포 후 책 상세 직접 URL·새로고침과 홈 표시를 다시 확인했으며 콘솔 오류·폰트 파싱 오류·mixed-content 경고가 없었다. Ionicons 폰트와 뒤로 가기 이미지는 원래 URL에서 각각 `font/ttf`, `image/png`로 응답하고 로컬 원본과 바이트가 같았다. `/`, `/auth/login`, `/ai-books`, 서로 다른 ISBN 상세 주소 2개도 200과 베타 색인 제외 헤더를 확인했다. 실제 기기의 Safari를 대신하는 결과는 아니다.

두 번째 AI 요청에서는 실제 Gemini HTTP 503 뒤 Groq으로 전환해 `MODEL / GROQ_AFTER_HTTP_503` 결과 4권을 반환했다. 이때 선택한 책들은 검증된 추천 이유가 없어 비교 화면에 소개 확인 안내를 표시했다. 이유를 만들어 채우지 않는 기존 근거 검증 정책이며, 모든 공급자 요청이 항상 이유를 제공한다는 보장은 없다.

## 초기 배포에서 수정한 문제

1. AI 테이블을 먼저 생성해 Flyway가 이력 없는 기존 public 스키마로 판단했다. 새 도메인 DB임을 확인하고 일회성 baseline version 0으로 V1~V4를 모두 실행했다. 이후 임시 설정을 제거하고 기본 운영 설정으로 재기동했다. compose에 Spring healthcheck와 AI의 기동 의존성을 추가해 새 설치는 Flyway → Alembic 순서를 따른다.
2. 공인 IP가 Docker NAT 뒤에 있어 SNI 없는 TLS 요청의 인증서 선택이 실패했다. Caddy의 `default_sni`를 설정해 일반 curl과 Chromium의 HTTPS 연결을 확인했다.
3. 환경변수를 전달한 정적 빌드는 성공했지만 Metro 캐시의 브라우저 번들은 API URL을 `undefined`로 유지해 공개 화면이 비었다. 캐시를 비운 재빌드로 해결했다. `npm run build:web`는 `expo export --clear` 후 실제 브라우저 번들 URL을 검사하며 CI도 이 빌드를 수행한다. URL 누락과 이전 주소 번들을 검사기가 거부하는 것도 확인했다. 진단용으로 잠시 추가했던 HTML 오류 로깅은 최종 재빌드에서 제거했다.

4. Pages가 Expo 출력의 `assets/node_modules` 디렉터리를 제외해 아이콘 폰트와 뒤로 가기 이미지 대신 HTML이 반환됐다. 배포 준비 단계에서 `assets/vendor`에 복사하고 원래 URL을 static rewrite로 연결했다.
5. 도서관 표지 데이터의 HTTP URL이 반복 렌더링마다 mixed-content 경고를 발생시켰다. 모든 도서 표지 UI에서 HTTPS URL로 요청하도록 공통 변환을 적용했다.

## 자동 검사

- Spring 전체 테스트 58개 통과 후, 동시 검색 용량 설정 검사 2개 추가 통과. 기본 동시 실행 값은 2, 이번 저사양 배포는 1로 설정했다.
- 프런트 `npm test` 3개, typecheck, lint 통과.
- 실제 API URL로 캐시 초기화 웹 export 성공. 브라우저 JS 번들에 실제 URL이 들어갔음을 확인했다.
- `docker compose config --quiet`, `git diff --check` 통과.

## 자원과 남은 범위

실제 검색과 화면 검증 후 RAM 약 535MiB 사용, available 약 416MiB, 스왑 약 389MiB 사용을 관찰했다. Spring·AI·DB의 OOM과 재시작은 0회였다. 초기 인기 도서 수집을 포함한 최초 Spring 기동은 약 295초였다. 이는 단기 소규모 확인이며 동시 사용자 부하·장시간 안정성을 검증한 결과는 아니다.

서버에 권한 600의 PostgreSQL 백업을 생성했다. 서버 외부 자동 백업과 복원 훈련은 아직 구성하지 않았다. 실제 iOS Safari·Android Chrome의 터치·키보드 검증도 별도로 필요하다. 마지막 로그아웃은 성공했지만 기존 React Native EventSource의 연결 정리 과정에서 `abort` 대상이 null이라는 경고가 출력됐다. 핵심 흐름을 막지는 않았으며 SSE 종료 처리의 후속 점검 항목으로 남긴다. 서버 운영·재배포 명령은 [배포 안내](../../deploy/README.md)에 있다.

OAuth 코드·인증 토큰·SSH 키·API 키는 이 기록에 저장하지 않는다.
