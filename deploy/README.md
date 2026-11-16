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

## 웹 빌드와 배포

```sh
cd BookAppFront
EXPO_PUBLIC_API_URL=https://<API_IP> npm run build:web
npx wrangler@4 pages deploy dist --project-name read-on-me-beta --branch main
```

`build:web`는 Metro 캐시를 비우고 Expo 의존성의 폰트·이미지를 Pages가 제외하지 않는 `assets/vendor` 경로로 복사하고, 실제 브라우저 번들에 API 주소가 포함됐는지 검사한다. `public/_redirects`가 원래 `assets/node_modules` URL을 새 경로로 전달한다. SSR 빌드 통과만으로는 브라우저의 환경변수 치환을 보장하지 않는다. 최초 Pages 프로젝트 생성은 `wrangler pages project create read-on-me-beta --production-branch main --force`로 진행했다(Wrangler 4.162.0). 프로젝트 생성 후에는 `--force`를 사용하지 않는다. 웹 주소가 바뀌면 서버 `.env`의 `WEB_ORIGIN`도 변경하고 backend를 재생성한다.

## 점검과 보존

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
