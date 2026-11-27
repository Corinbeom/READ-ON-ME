import os
from unittest.mock import Mock

import pytest
from alembic.migration import MigrationContext
from fastapi import FastAPI

from app import main


@pytest.mark.asyncio
@pytest.mark.parametrize("schema_matches", [True, False])
async def test_standby_serves_only_the_installed_schema_without_starting_workers(monkeypatch, schema_matches):
    url = os.getenv("REVIEWED_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a migrated disposable PostgreSQL database")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setattr(main, "app", FastAPI())
    monkeypatch.setattr(main._db, "engine", None)
    monkeypatch.setattr(main._db, "async_session", None)
    for fn in ("upgrade_database", "hold_pending_jobs", "run_shelf_keyword_worker"):
        monkeypatch.setattr(main, fn, Mock(side_effect=AssertionError(f"Standby called {fn}")))
    standby = main.standby()
    if schema_matches:
        async with main.lifespan(standby):
            assert main._db.async_session is not None
    else:
        monkeypatch.setattr(MigrationContext, "get_current_heads", lambda _: ("another_revision",))
        with pytest.raises(RuntimeError, match="installed database schema"):
            async with main.lifespan(standby):
                pytest.fail("Started an incompatible standby")
