"""Reuse a successful status check only while its database inputs are unchanged."""

import asyncio

from sqlalchemy import text

from app.services.reviewed_release import require_release


_generation = text("SELECT generation FROM corpus_release_generation WHERE singleton")
_verified = None
_verify_lock = asyncio.Lock()


async def confirm_release_status(db, release):
    global _verified
    async with db.begin():
        generation = (await db.execute(_generation)).scalar_one()
    if (release, generation) == _verified:
        return

    # A burst of polls after startup or an import needs just one full verification.
    async with _verify_lock:
        async with db.begin():
            await db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
            generation = (await db.execute(_generation)).scalar_one()
            key = (release, generation)
            if key == _verified:
                return
            await require_release(db, release)
        # Publish only after checking the generation and corpus in one committed snapshot.
        _verified = key
