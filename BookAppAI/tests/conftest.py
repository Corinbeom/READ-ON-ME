import os
import sys

import pytest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


@pytest.fixture(autouse=True)
def default_embedding_provider(monkeypatch):
    """Keep tests offline when the developer's .env selects Gemini."""
    monkeypatch.setenv("EMBEDDING_PROVIDER", "local")
    monkeypatch.delenv("LIBRARY_BIGDATA_API_KEY", raising=False)
