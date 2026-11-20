"""Bind a release to current field permissions, indexed inputs, models and two graded runs."""

import hashlib
import json
import os
from pathlib import Path

from sqlalchemy import text
from app.corpus_policy import CorpusPermissionError, EMBEDDING_USES
from app.services.reviewed_corpus import read_inputs
from app.services.embedding_backend import GEMINI_EMBEDDING_MODEL
from app.services.gemini_tagger import GEMINI_DEFAULT_MODEL
from app.services.reranker import GROQ_RERANK_MODEL, RERANK_MODEL


async def fingerprint(db):
    rows = (await db.execute(text("""
        SELECT e.isbn, e.input_version, md5(e.result::text), md5(t.result::text)
        FROM corpus_derived_artifacts e LEFT JOIN corpus_derived_artifacts t
          ON e.isbn=t.isbn AND e.input_version=t.input_version AND t.kind='tags' AND t.model_version=:tag
        WHERE e.kind='embedding' AND e.model_version=:embed
        ORDER BY e.isbn,e.input_version
    """), {"embed": GEMINI_EMBEDDING_MODEL, "tag": GEMINI_DEFAULT_MODEL})).all()
    entries = []
    for isbn, version, vector_digest, tags_digest in rows:
        try:
            fields, current = await read_inputs(db, isbn, EMBEDDING_USES)
        except CorpusPermissionError:
            continue
        if version == current:
            if tags_digest is None:
                raise CorpusPermissionError("AI_SEARCH_MAINTENANCE")
            entries.append([isbn, version, fields, vector_digest, tags_digest])
    version = hashlib.sha256()
    root = Path(__file__).resolve().parents[1]
    for path in ("corpus_policy.py", "services/reviewed_corpus.py", "services/reranker.py",
                 "services/intent_classifier.py", "services/reference_search.py"):
        version.update((root / path).read_bytes())
    version.update(json.dumps([GEMINI_EMBEDDING_MODEL, GEMINI_DEFAULT_MODEL, RERANK_MODEL,
                               GROQ_RERANK_MODEL, entries], sort_keys=True).encode())
    return version.hexdigest(), len(entries)


def configured_release():
    release = os.getenv("GALPI_REVIEWED_RELEASE", "")
    if len(release) != 64 or any(c not in "0123456789abcdef" for c in release):
        raise CorpusPermissionError("AI_SEARCH_MAINTENANCE")
    return release


async def require_release(db, release):
    runs = (await db.execute(text("""
        SELECT count(*) FROM corpus_quality_runs WHERE release=:release
          AND first_match >= 13 AND any_match >= 15 AND controls = 2
    """), {"release": release})).scalar_one()
    if runs < 2:
        raise CorpusPermissionError("AI_SEARCH_MAINTENANCE")
    current, count = await fingerprint(db)
    if count < 30 or current != release:
        raise CorpusPermissionError("AI_SEARCH_MAINTENANCE")
