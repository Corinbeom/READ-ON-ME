# main 기반 웹 배포 — 2026-11-17

## 변경 범위

- `ci/main-pages-deployment`에서 기존 UI·웹 베타 커밋을 계승하고 배포 워크플로와 운영 문서를 추가.
- 기존 Validation의 main push에서만 배포. PR에서는 Spring·AI·프론트 검사와 빌드만 실행.
- 배포는 세 검사 작업의 성공에 의존하며, 프론트가 검사한 SHA별 artifact를 재사용.
- API 주소·폰트·artifact의 커밋 SHA 재검증, 배포 직전 최신 main 확인, 배포 직렬화, 실제 공개 revision 확인.
- 빌드 작업에는 Cloudflare 토큰을 주입하지 않음. 배포 자격 증명은 해당 단계에 한정.
- 기존 Pages 프로젝트·웹/API 주소·Oracle 서버·DB는 유지. Oracle 자동 배포는 범위에 포함하지 않음.

## main에 통합할 기존 작업

- 무료 웹 베타 설정, 사용자별 AI 요청 제한·검색 동시 실행 설정.
- Safari 시작 폰트 수정, 홈 타이핑과 공통 화면 규격·하단 메뉴 개선.
- 홈 AI 진입, 검색 시작 화면과 최근 검색어.
- 서재 책 목록·빈 화면·인증 복귀와 저장 피드백.
- 이전 상세 UI/API 검증은 각 날짜의 QA 문서 참고.

## 검증

- Spring `./gradlew test --no-daemon`: BUILD SUCCESSFUL(기존 성공한 동일 소스의 결과 재사용).
- AI `.venv/bin/python -m pytest -q`: 196개 통과.
- 프론트 타입 검사·린트(경고 0개) 및 테스트 38개 통과.
- actionlint 1.7.12로 워크플로 검사 통과. 공식 릴리스의 SHA-256 검증 후 실행.
- GitHub PR 검사와 첫 main 자동 배포 결과는 완료 후 기록.

## 인증 설정

- 기존 계정 ID를 `CLOUDFLARE_ACCOUNT_ID` repository secret에 등록.
- `CLOUDFLARE_API_TOKEN`은 별도 등록 필요. 개인 Mac OAuth를 자동화용으로 복사하지 않음.
- 토큰 값과 자격 증명은 이 문서에 기록하지 않음.
