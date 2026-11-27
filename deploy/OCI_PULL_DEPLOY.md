# OCI 자동 배포

GitHub Actions가 검증한 Spring과 AI 이미지를 GHCR에 게시하면, OCI가 외부로 접속해 배포할 이미지를 읽어 옵니다. 공개 저장소에서 계속 운영하며 VM을 GitHub 러너로 등록할 필요가 없습니다.

## 활성화 순서

1. 이 변경을 병합한 뒤 `OCI_AUTO_DEPLOY_ENABLED` 변수는 비워 둡니다. Actions의 `Validation`을 `main`에서 수동 실행하면 서버 이미지와 배포 목록을 GHCR에 게시할 수 있습니다. 자동 배포가 활성화되기 전까지 웹은 기존 흐름으로 배포합니다.
2. OCI에서 기존 `/opt/readonme/compose.beta.yml`과 `Caddyfile`을 복사해 보관합니다. 현재 운영 이미지 태그와 환경 설정을 기준으로 Compose의 Caddy에 `./deploy-status:/srv/deploy-status:ro` 마운트를 추가하고, Caddyfile에 `/server-release.json` 경로를 추가합니다. `/opt/readonme/deploy-status` 디렉터리는 권한 `755`로 만들고 Caddy만 재생성합니다.
3. `/opt/readonme/pull-server-release.sh`와 시스템 서비스·타이머 파일을 설치합니다. VM의 `/etc/readonme-deploy/registry`는 root 소유와 권한 `700`으로 만듭니다. GHCR 패키지가 비공개라면 읽기 전용 패키지 토큰으로 `DOCKER_CONFIG=/etc/readonme-deploy/registry docker login ghcr.io --username <GitHub-계정> --password-stdin`을 실행합니다. 앱 실행 비밀값은 기존 OCI `.env`에 둡니다.
4. root 권한과 같은 `DOCKER_CONFIG`에서 `bash /opt/readonme/pull-server-release.sh --check`를 실행해 배포 목록을 읽을 수 있는지 확인합니다. 이어서 `systemctl daemon-reload` 후 서비스를 한 번 직접 실행하고, API의 `/server-release.json` 커밋이 `main`과 일치하는지 확인합니다.
5. 정상 배포와 복구를 확인한 뒤 `systemctl enable --now readonme-pull-deploy.timer`를 실행하고 GitHub 저장소 변수 `OCI_AUTO_DEPLOY_ENABLED`를 `true`로 설정합니다.

자동 배포는 GHCR의 운영 배포 목록에 기록된 커밋을 기준으로 Spring·AI의 Docker 빌드 디렉터리와 이미지 빌드 설정을 비교합니다. 서버 입력이 같으면 기존 이미지를 사용합니다. 웹만 바뀐 경우 OCI 컨테이너는 계속 실행되고 Cloudflare Pages만 갱신됩니다. AI 입력만 바뀌면 기존 Spring의 다이제스트와 새 AI 다이제스트를 묶어 게시합니다. OCI에서 그 Spring 이미지가 이미 실행 중이면 준비 상태를 확인하고 AI 컨테이너만 교체합니다. 일반 검색·서재·리뷰는 기존 Spring이 처리하고 갈피는 새 AI가 준비된 뒤 이용할 수 있습니다. Spring 또는 공통 빌드 설정이 바뀌면 두 이미지를 빌드합니다. OCI의 실제 Spring과 목표 이미지가 다르면 기존 순서대로 교체하므로 API가 잠시 중단될 수 있습니다.

웹은 OCI의 `/server-release.json`에서 필요한 서버 커밋이 확인된 뒤 게시됩니다. 앞서 게시한 서버 업데이트가 대기 중이면 웹 변경도 그 업데이트를 기다립니다. Pages의 `/release.json`에서 `commit`은 웹 커밋이고 `serverCommit`은 게시할 때 확인한 서버 커밋입니다. GitHub Actions의 수동 실행으로 현재 main의 서버 이미지를 다시 빌드할 수 있습니다. 베이스 이미지나 외부 의존성만 갱신할 때도 이 경로를 사용합니다.

기존 OCI에 적용할 때는 첫 AI 단독 게시 전에 `/opt/readonme/pull-server-release.sh`를 이 버전으로 교체합니다. 교체 전 `.oci-deploy/in-progress`가 없는지 확인하고 기존 스크립트를 보관합니다. 설치 후 서비스가 사용하는 레지스트리 설정으로 `--check`를 실행합니다. 실행 중인 Spring의 컨테이너 ID와 시작 시각은 `docker inspect`로 배포 전후 대조할 수 있습니다.

## 장애와 복구

- 새 이미지를 전송한 뒤 현재 데이터베이스를 `.oci-deploy/db-backup.dump`에 백업합니다. 배포가 시작되면 Spring 준비 상태를 확인한 뒤 AI를 시작합니다. 둘 다 실행되면 새 커밋을 공개합니다.
- 준비 상태 검사에 실패하면 백업한 이미지 조합으로 복구합니다. AI 단독 변경은 복구할 때도 실행 중인 Spring을 유지합니다. 이전 스키마와 호환 여부가 중요한 변경은 배포 전에 확인합니다. DB 백업을 이용한 복원은 별도로 판단해 실행합니다.
- 변경 도중 서비스가 중단되면 다음 실행에서 이전 이미지를 복원합니다. 실패한 동일 게시 시도는 반복 적용하지 않습니다. 원인을 해결한 뒤 실패한 서버 게시 실행이 현재 main이면 전체 작업을 재실행합니다. CI는 기존 다이제스트 두 개를 새 시도 번호로 다시 게시합니다. 후속 웹 변경이 이전 서버를 기다리는 상황이면 현재 main에서 Validation을 수동 실행해 서버를 재게시합니다. 이 경우 같은 main의 push 실행 전체를 다시 실행해 웹이 새 서버 커밋을 확인하게 합니다.
- 상태는 `journalctl -u readonme-pull-deploy.service`와 `/server-release.json`에서 확인합니다. 자동 적용 후 운영 중인 버전으로 Compose 명령을 실행할 때는 `-f compose.beta.yml -f .oci-deploy/active.yml`을 함께 지정합니다. 런타임 볼륨은 기존 프로젝트를 계속 사용합니다.

## 갈피 요청을 유지하는 AI 단독 배포

Spring이 내부 주소 `http://ai-router:8000`을 사용하면 AI 단독 배포 동안 기존 요청을 마칠 수 있습니다. 최초 전환은 Spring의 다음 정기 교체 또는 별도로 승인한 점검 시간에 진행합니다. 실행 중인 Spring을 즉시 재생성하면 처리 중인 갈피 추천과 일반 API 연결이 끊길 수 있습니다.

1. 기존 배포가 완료됐는지 확인하고 현재 배포 스크립트와 Compose 설정을 보관합니다. 이 버전의 `pull-server-release.sh`, `ai-handoff.sh`, `compose.ai-handoff.yml`, `ai-router.Caddyfile`을 `/opt/readonme`에 설치합니다.
2. 최초 설치 시 `.oci-deploy/ai-router/Caddyfile`에 `ai-router.Caddyfile`을 복사합니다. 임시 AI가 검증되면 스크립트가 같은 디렉터리에 `standby` 파일을 만들고, 기본 AI로 되돌린 뒤 제거합니다. 이 파일의 유무를 프록시가 요청마다 확인합니다. `docker compose -f compose.beta.yml -f compose.ai-handoff.yml up -d --no-deps ai-router`로 내부 프록시를 올립니다. 외부 공개 포트는 없습니다.
3. `docker compose -f compose.beta.yml exec -T backend curl -fsS http://ai-router:8000/health`로 연결을 확인합니다. 정기 Spring 교체 시점에 배포 잠금 안에서 `.oci-deploy/ai-router/enabled`를 만들면 다음 전체 배포에서 Spring에 새 주소를 적용합니다. 배포 서비스가 진행 중인 추천의 저장을 확인하고 Spring을 교체할 때까지 기다립니다. 적용 후 Spring의 `AI_BASE_URL`, 공개 갈피 이용 상태와 추천을 확인합니다. 이후 수동 Compose 작업에도 위 세 파일을 같은 순서로 지정합니다.
4. AI만 갱신하면 임시 컨테이너가 현재 DB 스키마와 Spring이 기대하는 검증 릴리스를 확인합니다. 임시 프로세스는 마이그레이션이나 백그라운드 작업을 실행하지 않습니다. 라우팅을 넘긴 뒤 Spring의 이용 상태를 확인하고 기존 AI에 최대 75초 동안 처리 중인 요청을 마칠 시간을 줍니다. 기본 AI 컨테이너가 새 이미지로 검증을 마치면 요청을 되돌리고 임시 컨테이너도 같은 순서로 종료합니다. 서재 작업과 코퍼스 운영 명령은 기본 AI 컨테이너에서 계속 실행합니다.

후보의 출처·품질 검증이나 스키마 확인이 실패하면 기존 AI가 계속 응답하고 배포 커밋 표시는 유지됩니다. 스키마가 바뀌는 AI 업데이트는 기존·새 버전의 호환성을 확인하고 별도로 스키마를 적용하거나 정기 전체 배포로 진행합니다. 진행 중 중단됐을 때는 배포 서비스의 다음 실행이 저장된 이미지와 라우팅 파일로 복구합니다. 수동으로 이전의 직접 연결로 돌아갈 때는 점검 시간에 임시 컨테이너가 없고 진행 중인 배포가 없는지 확인한 뒤, Spring에 기존 Compose 설정과 `.oci-deploy/active.yml`을 적용하고 갈피 검증 성공 후 `enabled` 표시를 제거합니다.

## Spring 정기 배포 중 갈피 작업

Spring 이미지가 바뀔 때 배포 스크립트는 DB에 임시 트리거를 설치해 대기 중인 작업을 실행 상태로 바꾸는 동작만 막습니다. 새 요청 접수, 폴링, 진행 중인 추천 결과 저장은 계속됩니다. 스크립트가 `RUNNING` 작업이 모두 끝난 것을 확인한 뒤 Spring과 AI를 교체합니다. Spring에서 새 AI의 이용 상태까지 확인하면 트리거를 제거하고 기존 작업 ID로 처리를 이어갑니다. 최초 전환에서 아직 트리거를 인식하지 못하는 이전 Spring도 DB가 같은 경계를 보장합니다.

진행 중인 작업이 90초 안에 끝나지 않거나 확인에 실패하면 기존 컨테이너를 유지하고 대기열을 다시 엽니다. 교체가 시작된 뒤 실패하면 이전 이미지의 준비 상태를 확인하고 대기열을 엽니다. 배포 프로세스 자체가 중단된 경우 다음 타이머 실행이 `.oci-deploy/in-progress`를 읽어 복구합니다. 단일 Spring을 재기동하는 동안에는 API 연결이 잠시 끊길 수 있으며, 이미 접수한 검색 화면은 같은 작업 ID로 조회를 재개합니다.

알림 스트림을 먼저 닫는 Spring 버전부터는 종료 시 브라우저의 알림 연결을 마치고 일반 HTTP 요청의 완료를 기다립니다. 기존 버전에서 처음 교체할 때는 이전 Spring의 종료 대기 시간이 적용됩니다.
