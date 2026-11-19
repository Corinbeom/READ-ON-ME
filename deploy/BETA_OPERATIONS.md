# 베타 운영

## 운영 화면

[서비스 운영](https://read-on-me-beta.pages.dev/operations)에서 접수된 의견을 유형과 상태로 필터링하고, 본문을 읽고, 상태를 바꿀 수 있습니다. 같은 의견을 열어둔 두 화면에서 상태를 바꾸면 먼저 저장한 내용이 반영됩니다. 최근 24시간 추천 집계와 마지막 외부 점검 결과도 함께 표시합니다.

운영 계정의 **Read On Me 사용자 ID**를 확인한 뒤 OCI의 `/opt/readonme/.env`에 `OPERATIONS_ADMIN_USER_IDS`로 설정합니다. 여러 계정을 허용하려면 ID를 쉼표로 구분합니다. 운영 Compose backend의 `environment`에 같은 변수가 있어야 Spring으로 전달됩니다. 해당 설정은 backend를 재생성하면 적용됩니다. 값이 비어 있으면 운영 API 접근이 모두 차단됩니다. 운영 API는 각 조회와 상태 변경에서 로그인 계정의 ID를 다시 확인합니다.

**추천 피드백**에서는 갈피 검색의 평가를 별점별로 필터링하고, 질문과 당시 후보 목록, 추가 의견을 함께 볼 수 있습니다. 사용자가 평가를 보내면 질문과 화면에 표시된 후보를 복사해 저장합니다. 별점은 1~5점이고 의견은 선택입니다. 결과가 없는 정상 검색도 평가할 수 있습니다. 사용자는 원본 추천 작업이 남아 있는 24시간 동안 평점을 수정할 수 있고, 접수된 평가는 추천 작업이 정리된 뒤에도 운영 화면에서 볼 수 있습니다.

**유저 현황**에서는 가입자 수와 이메일·카카오 계정 비중, 서재에 책을 담은 회원 수와 상태별 권수, 최근 24시간 갈피 이용을 볼 수 있습니다. 신규 가입은 한국 날짜를 기준으로 집계하며, 최근 7일에는 오늘이 포함됩니다. 갈피 이용 회원은 추천 요청을 보낸 계정을 한 번씩 셉니다. 권수와 이용 건수는 해당 화면을 열거나 새로고침했을 때의 집계입니다.

## 외부 장애 점검

GitHub Actions의 `Public uptime`이 15분마다 홈 HTML과 인기 도서 조회 API를 확인합니다. API는 DB의 도서 목록을 읽습니다. 인증과 LLM 호출은 사용하지 않습니다. 한 대상에서 두 번 연속 실패하면 워크플로가 실패하고, GitHub 계정에 설정한 Actions 알림으로 전달됩니다. GitHub 스케줄 실행이 지연되면 점검과 알림도 늦어질 수 있습니다.

GitHub의 **Settings → Notifications → Actions**에서 이메일 수신을 설정합니다. 이메일을 시험할 때는 **Actions → Public uptime → Run workflow**에서 `test_notification`을 켭니다. 이 실행은 의도적으로 실패합니다. 실제 서비스 점검은 해당 옵션을 끈 채 실행합니다.

## 최근 24시간의 갈피 추천

OCI 접속 권한이 있는 Mac에서 아래 명령을 실행합니다. `readonme-oci`를 실제 SSH 호스트 또는 접속 설정 이름으로 바꿉니다.

```sh
ssh readonme-oci 'sudo docker exec -i readonme-beta-postgres-1 psql -X -v ON_ERROR_STOP=1 -U readonme -d readonme' < deploy/beta-recommendations.sql
```

`with_results`에는 Gemini·Groq 결과와 후보 제공 폴백이 포함되고, `fallback_results`는 그중 폴백 건수입니다. `no_match`는 해당 조건으로 제시할 책이 없었던 건수입니다. `errors`에는 작업 실패와 장애로 인한 빈 응답이 포함됩니다. 응답시간은 요청 등록부터 처리 완료까지의 시간으로, 대기 시간을 포함합니다. 집계에 검색어와 사용자 식별자는 포함되지 않습니다. 추천 작업은 24시간 뒤 정리되므로 이 집계는 장기 추세를 보존하지 않습니다.

## 접수된 피드백

홈 하단의 **의견 보내기**에서 로그인 없이 제출할 수 있습니다. 제출 데이터는 유형, 본문, 접수 시각으로 저장합니다. 최근 30개는 OCI 접근 권한으로 확인합니다.

```sh
ssh readonme-oci 'sudo docker exec -i readonme-beta-postgres-1 psql -X -v ON_ERROR_STOP=1 -U readonme -d readonme' < deploy/beta-feedback.sql
```
