import asyncio
import os
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.corpus_policy import CorpusPermissionError, EMBEDDING_USES
from app.routers.data_builder import release_status
from app.services import release_status as status
from app.services.embedding_backend import GEMINI_EMBEDDING_MODEL
from app.services.gemini_tagger import GEMINI_DEFAULT_MODEL
from app.services.reviewed_release import fingerprint


@pytest_asyncio.fixture
async def engine():
    url = os.getenv("REVIEWED_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a migrated disposable PostgreSQL database")
    engine = create_async_engine(url)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def graded_release(engine):
    async with AsyncSession(engine) as db, db.begin():
        await db.execute(text("""
            INSERT INTO corpus_use_policy VALUES ('STATUS_TEST','test','fixture',current_date,:uses,true)
        """), {"uses": sorted(EMBEDDING_USES)})
        await db.execute(text("""
            INSERT INTO corpus_field_versions (isbn,field,provider,policy_version,source_ref,checked_on,digest,value)
            SELECT 'status-test-' || n, field, 'STATUS_TEST', 'test', 'fixture', current_date,
                   encode(sha256(convert_to(field,'UTF8')),'hex'), field
            FROM generate_series(1,30) n CROSS JOIN unnest(ARRAY['title','authors','contents']) field
        """))
        await db.execute(text("""
            WITH versions AS (
                SELECT isbn, string_agg(id::text, ',' ORDER BY field) AS version
                FROM corpus_field_versions WHERE provider='STATUS_TEST' GROUP BY isbn
            )
            INSERT INTO corpus_derived_artifacts (isbn,input_version,kind,model_version,result)
            SELECT isbn, version, kind, model, result FROM versions CROSS JOIN (
                VALUES ('embedding', :embed, '[1]'::jsonb), ('tags', :tag, '{}'::jsonb)
            ) artifacts(kind,model,result)
        """), {"embed": GEMINI_EMBEDDING_MODEL, "tag": GEMINI_DEFAULT_MODEL})
        release, count = await fingerprint(db)
        assert count >= 30
        await db.execute(text("""
            INSERT INTO corpus_quality_runs (run_id,release,evidence_digest,first_match,any_match,controls)
            SELECT gen_random_uuid(), :release, encode(sha256(uuid_send(gen_random_uuid())),'hex'), 13, 15, 2
            FROM generate_series(1,2)
        """), {"release": release})
    try:
        yield release
    finally:
        async with AsyncSession(engine) as db, db.begin():
            await db.execute(text("DELETE FROM corpus_quality_runs WHERE release=:r"), {"r": release})
            await db.execute(text("DELETE FROM corpus_derived_artifacts WHERE isbn LIKE 'status-test-%'"))
            await db.execute(text("DELETE FROM corpus_field_versions WHERE provider='STATUS_TEST'"))
            await db.execute(text("DELETE FROM corpus_use_policy WHERE provider='STATUS_TEST'"))


@pytest.mark.asyncio
async def test_polls_share_proof_until_committed_input_changes(engine, graded_release, monkeypatch):
    full_check = AsyncMock(wraps=status.require_release)
    monkeypatch.setattr(status, "require_release", full_check)
    monkeypatch.setattr(status, "_verify_lock", asyncio.Lock())

    async def probe(release=graded_release):
        async with AsyncSession(engine) as db:
            return await release_status(release, db)

    assert await asyncio.gather(*(probe() for _ in range(8))) == [{"release": graded_release}] * 8
    full_check.assert_awaited_once()
    with pytest.raises(CorpusPermissionError):
        await probe("0" * 64)
    async with AsyncSession(engine) as writer:
        revoke = text("UPDATE corpus_use_policy SET active=false WHERE provider='STATUS_TEST'")
        await writer.execute(revoke)
        assert await probe() == {"release": graded_release}
        await writer.rollback()
        await probe()
        assert full_check.await_count == 2
        await writer.execute(revoke)
        await writer.commit()
        with pytest.raises(CorpusPermissionError):
            await probe()

        await writer.execute(text("UPDATE corpus_use_policy SET active=true WHERE provider='STATUS_TEST'"))
        await writer.commit()
        await probe()
        await writer.execute(text("UPDATE corpus_quality_runs SET controls=0 WHERE release=:r"), {"r": graded_release})
        await writer.commit()
        with pytest.raises(CorpusPermissionError):
            await probe()


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", [
    "UPDATE corpus_field_versions SET value='replaced' WHERE isbn='status-test-1' AND field='title'",
    "UPDATE corpus_derived_artifacts SET result='[0]' WHERE isbn='status-test-1' AND kind='embedding'",
    "DELETE FROM corpus_derived_artifacts WHERE isbn='status-test-1' AND kind='tags'",
])
async def test_edited_edition_stops_an_already_verified_release(engine, graded_release, mutation):
    async with AsyncSession(engine) as db:
        await release_status(graded_release, db)
    async with AsyncSession(engine) as writer, writer.begin():
        await writer.execute(text(mutation))
    async with AsyncSession(engine) as db:
        with pytest.raises(CorpusPermissionError):
            await release_status(graded_release, db)


@pytest.mark.asyncio
async def test_artifact_changes_invalidate_proof_but_search_receipts_do_not(engine):
    async with AsyncSession(engine) as db, db.begin():
        async def generation():
            return (await db.execute(status._generation)).scalar_one()

        original = await generation()
        await db.execute(text("""
            INSERT INTO corpus_derived_artifacts VALUES ('status-test-receipt','v','reason','m','','{}')
        """))
        await db.execute(text("UPDATE corpus_derived_artifacts SET result='[]' WHERE isbn='status-test-receipt'"))
        assert await generation() == original
        for kind in ("tags", "reason", "embedding"):
            await db.execute(text("UPDATE corpus_derived_artifacts SET kind=:kind WHERE isbn='status-test-receipt'"),
                             {"kind": kind})
            current = await generation()
            assert current != original
            original = current
        await db.execute(text("DELETE FROM corpus_derived_artifacts WHERE isbn='status-test-receipt'"))
        assert await generation() != original
        for table in ("corpus_derived_artifacts", "corpus_quality_runs", "corpus_field_versions", "corpus_use_policy"):
            original = await generation()
            await db.execute(text(f"TRUNCATE {table} CASCADE"))
            assert await generation() != original
        await db.rollback()


@pytest.mark.asyncio
async def test_missing_generation_never_serves_cached_status(engine, graded_release):
    async with AsyncSession(engine) as db:
        await release_status(graded_release, db)
    async with AsyncSession(engine) as writer, writer.begin():
        generation = (await writer.execute(status._generation)).scalar_one()
        await writer.execute(text("DELETE FROM corpus_release_generation WHERE singleton"))
    try:
        async with AsyncSession(engine) as db:
            with pytest.raises(NoResultFound):
                await release_status(graded_release, db)
    finally:
        async with AsyncSession(engine) as writer, writer.begin():
            await writer.execute(text("INSERT INTO corpus_release_generation VALUES (true, :g)"), {"g": generation})
