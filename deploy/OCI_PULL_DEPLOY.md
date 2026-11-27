# OCI 자동 배포

GitHub Actions가 검증한 Spring과 AI 이미지를 GHCR에 게시하면, OCI가 외부로 접속해 배포할 이미지를 읽어 옵니다. 공개 저장소에서 계속 운영하며 VM을 GitHub 러너로 등록할 필요가 없습니다.

## 활성화 순서

1. 이 변경을 병합한 뒤 `OCI_AUTO_DEPLOY_ENABLED` 변수는 비워 둡니다. Actions의 `Validation`을 `main`에서 수동 실행하면 서버 이미지와 배포 목록을 GHCR에 게시할 수 있습니다. 자동 배포가 활성화되기 전까지 웹은 기존 흐름으로 배포합니다.
2. OCI에서 기존 `/opt/readonme/compose.beta.yml`과 `Caddyfile`을 복사해 보관합니다. 현재 운영 이미지 태그와 환경 설정을 기준으로 Compose의 Caddy에 `./deploy-status:/srv/deploy-status:ro` 마운트를 추가하고, Caddyfile에 `/server-release.json` 경로를 추가합니다. `/opt/readonme/deploy-status` 디렉터리는 권한 `755`로 만들고 Caddy만 재생성합니다.
3. `/opt/readonme/pull-server-release.sh`와 시스템 서비스·타이머 파일을 설치합니다. VM의 `/etc/readonme-deploy/registry`는 root 소유와 권한 `700`으로 만듭니다. GHCR 패키지가 비공개라면 읽기 전용 패키지 토큰으로 `DOCKER_CONFIG=/etc/readonme-deploy/registry docker login ghcr.io --username <GitHub-계정> --password-stdin`을 실행합니다. 앱 실행 비밀값은 기존 OCI `.env`에 둡니다.
4. root 권한과 같은 `DOCKER_CONFIG`에서 `bash /opt/readonme/pull-server-release.sh --check`를 실행해 배포 목록을 읽을 수 있는지 확인합니다. 이어서 `systemctl daemon-reload` 후 서비스를 한 번 직접 실행하고, API의 `/server-release.json` 커밋이 `main`과 일치하는지 확인합니다.
5. 정상 배포와 복구를 확인한 뒤 `systemctl enable --now readonme-pull-deploy.timer`를 실행하고 GitHub 저장소 변수 `OCI_AUTO_DEPLOY_ENABLED`를 `true`로 설정합니다.

자동 배포는 GHCR의 운영 배포 목록에 기록된 커밋을 기준으로 Spring·AI의 Docker 빌드 디렉터리와 이미지 빌드 설정을 비교합니다. 서버 입력이 같으면 기존 이미지를 사용합니다. 웹만 바뀐 경우 OCI 컨테이너는 계속 실행되고 Cloudflare Pages만 갱신됩니다. 서버 입력이 달라지면 같은 커밋에서 두 이미지를 빌드해 새 배포 목록을 게시합니다. 단일 VM에서 Spring을 교체하는 동안 API가 잠시 중단될 수 있습니다.

웹은 OCI의 `/server-release.json`에서 필요한 서버 커밋이 확인된 뒤 게시됩니다. 앞서 게시한 서버 업데이트가 대기 중이면 웹 변경도 그 업데이트를 기다립니다. Pages의 `/release.json`에서 `commit`은 웹 커밋이고 `serverCommit`은 게시할 때 확인한 서버 커밋입니다. GitHub Actions의 수동 실행으로 현재 main의 서버 이미지를 다시 빌드할 수 있습니다. 베이스 이미지나 외부 의존성만 갱신할 때도 이 경로를 사용합니다.

## 장애와 복구

- 새 이미지를 전송한 뒤 현재 데이터베이스를 `.oci-deploy/db-backup.dump`에 백업합니다. 배포가 시작되면 Spring 준비 상태를 확인한 뒤 AI를 시작합니다. 둘 다 실행되면 새 커밋을 공개합니다.
- 준비 상태 검사에 실패하면 이전 컨테이너 이미지를 다시 실행합니다. 이전 스키마와 호환 여부가 중요한 변경은 배포 전에 확인합니다. DB 백업을 이용한 복원은 별도로 판단해 실행합니다.
- 변경 도중 서비스가 중단되면 다음 실행에서 이전 이미지를 복원합니다. 실패한 동일 게시 시도는 반복 적용하지 않습니다. 원인을 해결한 뒤 실패한 서버 게시 실행이 현재 main이면 전체 작업을 재실행합니다. 후속 웹 변경이 이전 서버를 기다리는 상황이면 현재 main에서 Validation을 수동 실행해 서버를 재게시합니다. 이 경우 같은 main의 push 실행 전체를 다시 실행해 웹이 새 서버 커밋을 확인하게 합니다.
- 상태는 `journalctl -u readonme-pull-deploy.service`와 `/server-release.json`에서 확인합니다. 자동 적용 후 운영 중인 버전으로 Compose 명령을 실행할 때는 `-f compose.beta.yml -f .oci-deploy/active.yml`을 함께 지정합니다. 런타임 볼륨은 기존 프로젝트를 계속 사용합니다.
