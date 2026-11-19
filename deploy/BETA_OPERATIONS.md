# 베타 운영

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
