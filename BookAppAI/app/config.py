import logging
import os

logger = logging.getLogger(__name__)

_FORBIDDEN = {"", "dev-internal-token", "change-me", "readonme"}

# 'production', 'prd' 등 운영 환경 관용 표기를 모두 prod로 취급
_PROD_ENV_VALUES = {"prod", "production", "prd"}

_REQUIRED_KEYS = [
    "GEMINI_API_KEY",
    "KAKAO_API_KEY",
    "DATABASE_URL",
    "INTERNAL_API_TOKEN",
    "SPRING_BOOT_URL",
]


def validate_prod_config() -> None:
    """prod 환경에서 필수 env가 누락되거나 개발용 기본값이면 즉시 실패."""
    if os.getenv("APP_ENV", "").lower() not in _PROD_ENV_VALUES:
        return

    errors = []

    for key in _REQUIRED_KEYS:
        val = os.getenv(key, "")
        if val in _FORBIDDEN:
            reason = "비어 있음" if not val else f"개발용 기본값 사용 불가 ('{val}')"
            errors.append(f"  - {key}: {reason}")

    spring_url = os.getenv("SPRING_BOOT_URL", "")
    spring_url_in_errors = any("SPRING_BOOT_URL" in e for e in errors)
    if "localhost" in spring_url and not spring_url_in_errors:
        logger.warning("[운영 설정 경고] SPRING_BOOT_URL 에 localhost 포함: '%s' — 운영 URL로 교체를 권장합니다.", spring_url)

    if errors:
        msg = "[운영 필수 설정 오류] 아래 값을 확인 후 재배포하세요:\n" + "\n".join(errors)
        logger.critical(msg)
        raise RuntimeError(msg)
