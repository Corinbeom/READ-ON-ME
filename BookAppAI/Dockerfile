FROM python:3.12-slim

WORKDIR /app

ARG EMBEDDING_PROVIDER=local
COPY requirements.txt requirements-local.txt ./
# 빌드 환경(네트워크)에서 PyPI 다운로드가 느릴 때 타임아웃이 자주 발생하므로
# timeout / retry를 넉넉하게 잡아 Docker build 안정성을 높입니다.
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=180 \
    PIP_RETRIES=10

RUN python -m pip install --upgrade pip setuptools wheel \
 && pip install --prefer-binary --no-cache-dir -r requirements.txt \
 && if [ "$EMBEDDING_PROVIDER" = "local" ]; then pip install --prefer-binary --no-cache-dir -r requirements-local.txt; fi

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


