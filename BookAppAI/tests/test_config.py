import pytest
from app.config import validate_prod_config


@pytest.fixture(autouse=True)
def _full_prod_env(monkeypatch):
    """운영 환경 완전한 기본값 — 각 테스트에서 원하는 키만 덮어씀."""
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("GEMINI_API_KEY", "real-gemini-key")
    monkeypatch.setenv("KAKAO_API_KEY", "real-kakao-key")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@postgres:5432/db")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "super-secure-internal-token-here")
    monkeypatch.setenv("SPRING_BOOT_URL", "http://backend:8080")


def test_passes_with_all_valid_values():
    validate_prod_config()  # 예외 없어야 함


def test_dev_env_skips_validation(monkeypatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    validate_prod_config()  # dev는 검증 건너뜀


def test_missing_env_skips_validation(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    validate_prod_config()  # APP_ENV 미설정도 건너뜀


def test_fails_when_gemini_key_is_empty(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
        validate_prod_config()


def test_fails_when_kakao_key_is_missing(monkeypatch):
    monkeypatch.delenv("KAKAO_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="KAKAO_API_KEY"):
        validate_prod_config()


def test_fails_when_internal_token_is_dev_default(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_TOKEN", "dev-internal-token")
    with pytest.raises(RuntimeError, match="INTERNAL_API_TOKEN"):
        validate_prod_config()


def test_fails_when_database_url_is_empty(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "")
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        validate_prod_config()


def test_reports_all_errors_at_once(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("KAKAO_API_KEY", "")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "dev-internal-token")
    with pytest.raises(RuntimeError) as exc_info:
        validate_prod_config()
    msg = str(exc_info.value)
    assert "GEMINI_API_KEY" in msg
    assert "KAKAO_API_KEY" in msg
    assert "INTERNAL_API_TOKEN" in msg


def test_production_env_value_triggers_validation(monkeypatch):
    """APP_ENV=production 도 prod와 동일하게 검증을 실행해야 한다."""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
        validate_prod_config()


def test_prd_env_value_triggers_validation(monkeypatch):
    """APP_ENV=prd 도 prod와 동일하게 검증을 실행해야 한다."""
    monkeypatch.setenv("APP_ENV", "prd")
    monkeypatch.setenv("KAKAO_API_KEY", "")
    with pytest.raises(RuntimeError, match="KAKAO_API_KEY"):
        validate_prod_config()


def test_fails_when_value_is_readonme(monkeypatch):
    """'readonme' 는 FORBIDDEN 값이다."""
    monkeypatch.setenv("INTERNAL_API_TOKEN", "readonme")
    with pytest.raises(RuntimeError, match="INTERNAL_API_TOKEN"):
        validate_prod_config()
