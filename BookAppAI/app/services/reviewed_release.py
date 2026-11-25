"""Bind a release to current field permissions, indexed inputs, models and two graded runs."""

import hashlib
import json
import os
from pathlib import Path
from dataclasses import dataclass

from sqlalchemy import text
from app.corpus_policy import CorpusPermissionError, EMBEDDING_USES
from app.services.reviewed_corpus import read_input_batch
from app.services.embedding_backend import GEMINI_EMBEDDING_MODEL
from app.services.gemini_tagger import GEMINI_DEFAULT_MODEL
from app.services.reranker import GROQ_RERANK_MODEL, RERANK_MODEL


@dataclass
class ReviewedEdition:
    fields: dict
    version: str
    tags: dict | None
    tags_digest: str | None
    vector_digest: str
    vector: list[float] | None


async def load_index(db, *, with_vectors):
    """Load permitted, current editions in ISBN order. Keep field/policy locks until commit."""
    isbns = (await db.execute(text("""
        SELECT DISTINCT isbn FROM corpus_derived_artifacts WHERE kind='embedding' AND model_version=:embed
    """), {"embed": GEMINI_EMBEDDING_MODEL})).scalars().all()
    inputs = await read_input_batch(db, isbns, EMBEDDING_USES)
    if not inputs:
        return {}
    rows = await db.execute(text("""
        SELECT e.isbn, e.input_version, md5(e.result::text), md5(t.result::text), t.result,
               CASE WHEN :with_vectors THEN e.result END
        FROM unnest(CAST(:isbns AS text[]), CAST(:versions AS text[])) AS current_input(isbn, version)
        JOIN corpus_derived_artifacts e ON e.isbn=current_input.isbn AND e.input_version=current_input.version
        LEFT JOIN corpus_derived_artifacts t
          ON e.isbn=t.isbn AND e.input_version=t.input_version AND t.kind='tags' AND t.model_version=:tag
        WHERE e.kind='embedding' AND e.model_version=:embed
        ORDER BY e.isbn
    """), {"isbns": list(inputs), "versions": [version for _, version in inputs.values()],
           "embed": GEMINI_EMBEDDING_MODEL, "tag": GEMINI_DEFAULT_MODEL, "with_vectors": with_vectors})
    index = {}
    for isbn, version, vector_digest, tags_digest, tags, vector in rows:
        if isbn in index:
            raise CorpusPermissionError("AI_SEARCH_MAINTENANCE")
        index[isbn] = ReviewedEdition(inputs[isbn][0], version, tags, tags_digest, vector_digest, vector)
    return index


def _fingerprint(index):
    entries = []
    for isbn, edition in index.items():
        if edition.tags_digest is None:
            raise CorpusPermissionError("AI_SEARCH_MAINTENANCE")
        entries.append([isbn, edition.version, edition.fields, edition.vector_digest, edition.tags_digest])
    version = hashlib.sha256()
    root = Path(__file__).resolve().parents[1]
    for path in ("corpus_policy.py", "services/reviewed_corpus.py", "services/reranker.py",
                 "services/intent_classifier.py", "services/reference_search.py", "services/reviewed_release.py"):
        version.update((root / path).read_bytes())
    version.update(json.dumps([GEMINI_EMBEDDING_MODEL, GEMINI_DEFAULT_MODEL, RERANK_MODEL,
                               GROQ_RERANK_MODEL, entries], sort_keys=True).encode())
    return version.hexdigest()


def _books(index):
    return {isbn: (edition.fields, edition.tags) for isbn, edition in index.items()}


async def _release_snapshot(db):
    index = await load_index(db, with_vectors=False)
    return _fingerprint(index), _books(index)


async def fingerprint(db):
    release, books = await _release_snapshot(db)
    return release, len(books)


def configured_release():
    release = os.getenv("GALPI_REVIEWED_RELEASE", "")
    if len(release) != 64 or any(c not in "0123456789abcdef" for c in release):
        raise CorpusPermissionError("AI_SEARCH_MAINTENANCE")
    return release


async def require_index(db, release, *, with_vectors):
    runs = (await db.execute(text("""
        SELECT count(*) FROM (
            SELECT first_match,any_match,controls FROM corpus_quality_runs WHERE release=:release
            ORDER BY checked_at DESC,run_id DESC LIMIT 2
        ) recent WHERE first_match >= 13 AND any_match >= 15 AND controls = 2
    """), {"release": release})).scalar_one()
    if runs < 2:
        raise CorpusPermissionError("AI_SEARCH_MAINTENANCE")
    index = await load_index(db, with_vectors=with_vectors)
    if len(index) < 30 or _fingerprint(index) != release:
        raise CorpusPermissionError("AI_SEARCH_MAINTENANCE")
    return index


async def require_release(db, release):
    return _books(await require_index(db, release, with_vectors=False))
