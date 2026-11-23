"""Resolve library ISBNs independently of the Galpi release and its embeddings."""
import asyncio
import logging
from contextlib import closing
from pathlib import Path
import sqlite3

from sqlalchemy import text

from app import database
from app.corpus_policy import CorpusPermissionError, MODEL_USES, permits
from app.services.gemini_tagger import GEMINI_DEFAULT_MODEL, GeminiTagger
from app.services.reading_keyword_picks import korean_tags, library_keywords
from app.services.reviewed_corpus import derived, read_inputs

CATALOG = Path(__file__).resolve().parents[1] / "data" / "seongnam-20260107.sqlite3"
CATALOG_USES = {"store", "display", "publish_derivative", "commercial"}
logger = logging.getLogger(__name__)


def catalog_tags(isbns):
    result = {}
    with closing(sqlite3.connect(CATALOG.as_uri() + "?mode=ro&immutable=1", uri=True)) as db:
        for start in range(0, len(isbns), 500):
            batch = isbns[start:start + 500]
            placeholders = ",".join("?" for _ in batch)
            for isbn, terms in db.execute(f"SELECT isbn,tags FROM subjects WHERE isbn IN ({placeholders})", batch):
                result[str(isbn)] = terms.split("|")
    return result


async def shelf_keywords(db, requested, limit):
    isbns = sorted({s for s in requested if len(s) == 13 and s.isascii() and s.isdigit()})
    catalog = {}
    pending = set()
    failed = set()
    policy = (await db.execute(text("""
        SELECT active, uses FROM corpus_use_policy WHERE provider='SEONGNAM_HOLDINGS' AND version='20260107'
        FOR SHARE
    """))).one_or_none()
    if policy and permits("SEONGNAM_HOLDINGS", policy.active, policy.uses, CATALOG_USES):
        catalog = await asyncio.to_thread(catalog_tags, isbns)
    labels = {isbn: tags.copy() for isbn, tags in catalog.items()}

    candidates = await db.scalars(text("""
        SELECT DISTINCT isbn FROM corpus_field_versions WHERE current AND field='contents'
        AND isbn=ANY(CAST(:isbns AS text[])) ORDER BY isbn
    """), {"isbns": isbns})
    for isbn in candidates:
        try:
            _, version = await read_inputs(db, isbn, MODEL_USES)
        except CorpusPermissionError:
            continue
        params = dict(isbn=isbn, version=version, model=GEMINI_DEFAULT_MODEL)
        result = await db.scalar(text("""
            SELECT result FROM corpus_derived_artifacts WHERE isbn=:isbn AND kind='tags'
            AND input_version=:version AND model_version=:model AND context_key=''
        """), params)
        if result is not None:
            labels.setdefault(isbn, []).extend(korean_tags(result.get("tags")))
            continue
        existing = (await db.execute(text("""
            SELECT status,run_after<=now() AS due FROM shelf_keyword_jobs
            WHERE isbn=:isbn AND input_version=:version AND model=:model
        """), params)).one_or_none()
        status = existing.status if existing else "pending"
        if not existing:
            await db.execute(text("""
                INSERT INTO shelf_keyword_jobs (isbn,input_version,model) VALUES (:isbn,:version,:model)
                ON CONFLICT DO NOTHING
            """), params)
        elif status == "held" or (status == "failed" and existing.due):
            await db.execute(text("""
                UPDATE shelf_keyword_jobs SET status='pending', attempts=0, run_after=now()
                WHERE isbn=:isbn AND input_version=:version AND model=:model AND status=:status
            """), {**params, "status": status})
            status = "pending"
        if not labels.get(isbn):
            if status == "pending":
                pending.add(isbn)
            elif status == "failed":
                failed.add(isbn)

    result = library_keywords(labels, isbns, limit)
    for keyword in result["keywords"]:
        keyword["catalog_count"] = sum(keyword["tag"] in catalog.get(isbn, ()) for isbn in keyword["book_isbns"])
    return {**result, "pending": len(pending), "failed": len(failed)}


async def process_next(db):
    job = (await db.execute(text("""
        SELECT isbn,input_version,model,attempts FROM shelf_keyword_jobs
        WHERE status='pending' AND run_after<=now()
        ORDER BY run_after,isbn LIMIT 1 FOR UPDATE SKIP LOCKED
    """))).mappings().one_or_none()
    if job is None:
        return False
    isbn = job["isbn"]
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:isbn,0))"), {"isbn": isbn})
    tagger = GeminiTagger(model_name=job["model"])
    try:
        _, version = await read_inputs(db, isbn, MODEL_USES)
        if version != job["input_version"] or job["model"] != GEMINI_DEFAULT_MODEL:
            status = "held"
        else:
            async def classify(fields):
                result = await tagger._classify(**fields)
                if result and korean_tags(result.get("tags")):
                    quote = result.get("evidence_quote", "")
                    if not quote or quote not in fields["contents"]:
                        tagger.last_error_code = "UNVERIFIED_EVIDENCE"
                        return None
                return result
            await derived(db, isbn, MODEL_USES, "tags", job["model"], classify)
            status = "done"
    except CorpusPermissionError:
        status = "held"
    except RuntimeError:
        if not tagger.last_error_code:
            raise
        status = "pending" if job["attempts"] < 4 else "failed"
        logger.warning("Shelf keyword classification deferred reason=%s", tagger.last_error_code)
    await db.execute(text("""
        UPDATE shelf_keyword_jobs SET status=:status, attempts=attempts+1,
            run_after=now() + (:delay * interval '1 minute')
        WHERE isbn=:isbn AND input_version=:input_version AND model=:model
    """), {**job, "status": status, "delay": 1440 if status == "failed" else 2 ** job["attempts"]})
    return True


async def run_worker():
    while True:
        try:
            async with database.async_session() as db, db.begin():
                processed = await process_next(db)
            if processed:
                continue
        except Exception:
            logger.exception("Could not process shelf keyword job")
        await asyncio.sleep(10)
