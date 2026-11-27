# 무료 웹 베타 배포

웹은 Cloudflare Pages, API·AI·PostgreSQL·Redis·Caddy는 Oracle Ubuntu VM에서 실행한다. 이 구성은 E2.1.Micro 1GB의 소규모 검증용이며 동시 AI 검색을 1건으로 제한한다. JVM 힙 192MB, AI 192MB 제한과 2GB 스왑을 사용한다. 장시간 부하에 대한 운영 용량을 보장하지 않는다.

## 서버 준비

Docker Engine과 Compose v2를 설치하고 `/opt/readonme`에 `compose.beta.yml`, `Caddyfile`, `.env`를 복사한다. `.env.example`의 빈 값을 채우되 DB 비밀번호는 URL에도 사용하므로 16진수 등 URL 안전한 값으로 생성한다. JWT·내부 토큰은 각각 32자 이상이어야 한다. 폴더는 700, `.env`는 600 권한을 사용한다. 비밀값은 Git과 이미지에 포함하지 않는다.

이미지는 로컬에서 빌드한 뒤 `docker save`/`docker load`로 전송한다. AI 이미지는 `--build-arg EMBEDDING_PROVIDER=gemini`로 빌드해 로컬 모델 의존성을 설치하지 않는다. 현재 이미지 태그는 compose 파일에 기록되어 있다.

OCI의 공인 서브넷 라우팅은 `0.0.0.0/0 → 인터넷 게이트웨이`로 설정한다. 수신 TCP 80·443은 공개하고 SSH 22는 관리자 공인 IP의 `/32`로 제한한다. DB·Redis·AI 포트는 외부로 공개하지 않는다. Spring은 호스트의 `127.0.0.1:18080`에서만 접근할 수 있다.

## 최초 기동과 코퍼스 이전

```sh
cd /opt/readonme
sudo docker compose -f compose.beta.yml config --quiet
sudo docker compose -f compose.beta.yml up -d
```

기동 순서는 PostgreSQL → Spring의 Flyway → AI의 Alembic이다. AI는 Spring healthcheck 통과 후 시작한다. 빈 DB에서 AI 테이블을 먼저 만들면 Flyway가 이력 없는 기존 스키마로 판단해 기동을 거부한다. 2026-11-16 최초 배포에서는 이 상태를 확인해, 도메인 테이블이 없는 신규 DB에 한해 임시 `baseline-on-migrate=true`, `baseline-version=0`으로 V1~V4를 모두 실행했다. 이후 임시 설정을 제거하고 `baseline-on-migrate=false`로 다시 기동했다. 기존 사용자 DB에 이를 임의 적용하지 않는다.

코퍼스는 AI의 Alembic 완료 후 `book_corpus`만 명시적 열 목록의 CSV COPY로 이전한다. 개발 사용자·서재·리뷰는 복사하지 않는다. COPY 후 ID 시퀀스를 현재 최댓값으로 맞춘다. `ACTIVE`·`LEGACY` 도서는 `gemini_embedding` 누락이 없어야 하며, 공급자 전환 시에는 사전에 backfill을 완료한다.

## HTTPS

`API_HOST`에는 공인 IP를 넣는다. Caddy는 Let's Encrypt의 shortlived 프로필로 IP 인증서를 발급하고 갱신한다. 80·443 접근과 Caddy 데이터 볼륨을 유지한다. `default_sni`는 NAT 뒤에서 IP로 접속하는 클라이언트의 인증서 선택을 위해 설정했다. 외부의 일반 `curl https://<IP>/api/books/test`와 브라우저에서 인증서 검증을 확인한다. 검증 우회 옵션으로 성공 처리하지 않는다.

## 카카오 로그인

카카오 로그인은 `KAKAO_LOGIN_JAVASCRIPT_KEY`, `KAKAO_LOGIN_REST_API_KEY`, `KAKAO_LOGIN_CLIENT_SECRET`, `KAKAO_LOGIN_REDIRECT_URI`를 모두 설정했을 때 켜진다. 운영의 리다이렉트 URI는 `https://read-on-me-beta.pages.dev/auth/kakao/callback`이다. 카카오 콘솔의 JavaScript 키와 REST API 키 양쪽에 같은 URI를 등록한다. JavaScript 키의 SDK 도메인에는 운영 웹 주소를 등록한다.

기존 OCI 설치에서는 현재 이미지·볼륨 설정을 유지한 채 `deploy/compose.beta.yml`의 새 `KAKAO_LOGIN_*` 환경 변수 항목을 운영 Compose의 backend에 추가한다. 값은 OCI의 `/opt/readonme/.env`에 보관한다. 자동 배포는 이미지 태그만 갱신하므로 이 설정은 첫 활성화 전에 적용한다. 도서 검색에는 기존 `KAKAO_API_KEY`를 사용한다.

Spring 배포 시 Flyway V5가 카카오 계정용 컬럼을 추가한다. 이메일 로그인은 기존 자격증명을 계속 사용한다. 카카오 로그인을 검증할 때는 책 상세의 서재 저장 버튼에서 로그인 화면을 연 뒤, 모바일 브라우저에서 카카오 인증을 마치고 같은 책으로 돌아오는지 확인한다.

## 웹 자동 배포

Spring과 AI의 GHCR 게시, OCI 설치 및 활성화 절차는 [OCI 자동 배포](OCI_PULL_DEPLOY.md)를 참고합니다.

운영 웹은 `.github/workflows/validation.yml`로 배포한다. 기능 브랜치는 PR로 검증하고 main에 병합한다. main 갱신 시 Spring·AI·프론트 검사가 모두 성공해야 Cloudflare Pages의 `read-on-me-beta` 프로젝트에 배포된다. PR과 기능 브랜치에서는 운영 배포를 실행하지 않는다. OCI 자동 배포가 켜져 있으면 AI 입력만 바뀐 경우 기존 Spring 이미지와 새 AI 이미지를 함께 지정한다. OCI에서 해당 Spring이 실행 중이면 AI만 교체한다. 웹은 필요한 서버 버전을 확인한 뒤 게시한다.

프론트 검사에서 한 번 생성한 `dist`를 커밋 SHA별 Actions artifact로 보관하고 배포 작업에서 그대로 내려받는다. 배포 단계는 API 주소·폰트와 커밋 정보를 다시 검증한다. 배포 작업은 동시에 한 건만 실행하며, 대기 중인 작업이 최신 main보다 오래된 커밋이면 건너뛴다. 배포 런타임은 Node 22(22.12 이상)이며 Wrangler는 4.162.0으로 고정한다.

배포 후 `https://read-on-me-beta.pages.dev/release.json`의 `commit`이 해당 main SHA와 같은지 확인한다. OCI 자동 배포를 사용하는 릴리스는 이 파일의 `serverCommit`에 게시 시 확인한 서버 커밋도 기록한다. 검사나 빌드가 실패하면 배포 단계는 실행하지 않는다. 업로드 이후 확인 단계가 실패한 경우 이미 배포가 이루어졌을 수 있으므로 실제 release.json과 Pages 배포 기록을 먼저 확인한다.

### 최초 인증 설정

GitHub 저장소 Settings → Secrets and variables → Actions에 다음 repository secrets를 등록한다.

| 이름 | 값 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 기존 `read-on-me-beta` 프로젝트의 계정 ID |
| `CLOUDFLARE_API_TOKEN` | 해당 계정만 허용한 Account → Cloudflare Pages → Edit API 토큰 |

개인 Mac의 Wrangler OAuth 토큰을 Actions에 복사하지 않는다. API 토큰은 Git·로그·채팅에 남기지 않는다. 토큰 교체 시 같은 이름의 secret만 갱신한다. 선택 변수 `WEB_API_URL`은 빌드에 공개되는 API 주소이며, 미설정 시 현재 주소 `https://152.67.222.15`를 사용한다. API 키나 JWT 비밀값을 이 변수에 넣지 않는다.

설정과 GitHub Actions 검사는 PR에서 먼저 확인한 뒤 main에 통합한다. 첫 자동 배포의 성공 실행과 공개 revision 일치를 확인해야 연결 완료로 판단한다. 실제 검증 기록은 [main 자동 배포 점검](../BookAppFront/qa/main-pages-deployment-2026-11-17.md)에 남긴다.

### 일반 릴리스와 복구

1. 기능 브랜치에서 변경·테스트 후 PR을 생성한다.
2. `backend`, `ai`, `frontend` 검사를 확인한다. OCI 자동 배포가 켜져 있으면 병합 후 Actions가 서버 입력을 비교하고, 필요한 서버 커밋을 확인한 뒤 웹을 게시한다.
3. main의 Validation 실행에서 `Deploy production web` 완료와 공개 `release.json`을 확인한다.
4. 배포 실패 시 원인을 수정한 PR을 병합하거나, 같은 최신 main의 실패 작업을 재실행한다. 과거 릴리스로 되돌리려면 main에 revert를 반영해 다시 배포한다. 오래된 실행 재실행은 최신 main 검사에 의해 배포를 건너뛴다.

운영 주소를 지정한 로컬 빌드 검증은 아래처럼 수행할 수 있다. 운영 업로드는 main의 Actions에서 진행한다.

```sh
cd BookAppFront
EXPO_PUBLIC_API_URL=https://152.67.222.15 npm run build:web
```

`build:web`는 Metro 캐시를 비우고 Expo 의존성의 폰트·이미지를 Pages가 제외하지 않는 `assets/vendor` 경로로 복사하고, 실제 브라우저 번들에 API 주소가 포함됐는지 검사한다. `public/_redirects`가 원래 `assets/node_modules` URL을 새 경로로 전달한다. SSR 빌드 통과만으로는 브라우저의 환경변수 치환을 보장하지 않는다. 기존 프로젝트의 production branch는 main이다. 최초 프로젝트 생성 후에는 `--force`를 사용하지 않는다. 웹 주소가 바뀌면 서버 `.env`의 `WEB_ORIGIN`도 변경하고 backend를 재생성한다.

## 점검과 보존

외부 장애 알림, 최근 24시간의 갈피 추천 집계, 익명 피드백 확인은 [베타 운영](BETA_OPERATIONS.md)을 참고합니다.

```sh
cd /opt/readonme
sudo docker compose -f compose.beta.yml ps
sudo docker compose -f compose.beta.yml logs --tail=50 backend ai caddy
sudo docker stats --no-stream
free -m
curl --fail http://127.0.0.1:18080/actuator/health
sudo docker compose -f compose.beta.yml exec -T postgres pg_dump -U readonme -d readonme -Fc > readonme-backup.dump
chmod 600 readonme-backup.dump
```

백업에는 사용자 데이터가 포함되므로 접근을 제한한다. 외부 별도 저장소의 자동 백업과 복원 훈련은 아직 구성하지 않았다. `down -v`는 DB·인증서 볼륨을 삭제하므로 사용하지 않는다. 재배포에는 `up -d`를 사용하고, 이미지 교체 전 백업을 남긴다. 장애 시 restart 횟수·OOM·메모리와 스왑·공급자 API 한도를 확인한다. `/api/library/all`과 actuator·API 문서 경로는 공개 프록시에서 차단한다.

웹 시작 폰트는 `font-display: swap`을 사용한다. HTML 준비 단계가 모든 정적 경로에서 폰트 preload를 제거해 Safari가 폰트 다운로드를 기다리며 첫 화면을 숨기는 현상을 피한다. 이미지 preload와 font-face 규칙은 유지한다. 배포 검증기는 폰트 설정과 preload를 검사하며, 회귀 테스트는 `npm test`에 포함한다.
