import hmac
import os

from fastapi import Header, HTTPException, Request


_PROD_ENVS = {"prod", "production", "prd"}
_LOCAL_HOSTS = {"127.0.0.1", "::1", "testclient"}


async def require_internal_token(
    request: Request,
    x_internal_token: str | None = Header(default=None),
) -> None:
    expected = os.getenv("INTERNAL_API_TOKEN", "")
    is_prod = os.getenv("APP_ENV", "").lower() in _PROD_ENVS
    if expected:
        if x_internal_token and hmac.compare_digest(x_internal_token, expected):
            return
    elif not is_prod and request.client and request.client.host in _LOCAL_HOSTS:
        return
    raise HTTPException(status_code=403, detail="Internal API token required")
