"""Operator-only ingress for field-reviewed inputs. No legacy metadata fallback."""

import hashlib
import json
import re
from datetime import date

from sqlalchemy import text

from app.corpus_policy import CorpusPermissionError, HOLD_REASON, MODEL_FIELDS, permits
from app.services.corpus_quality import normalize_isbn


# Work-level evidence for editions in the reviewed corpus. The English translation
# of The Vegetarian won in 2016. https://thebookerprizes.com/the-booker-library/books/the-vegetarian
_VERIFIED_AWARDS = {"9788936433598": ("맨부커 인터내셔널상", "부커 인터내셔널상", "인터내셔널 부커상")}
_GENERIC_PRIZES = {"상", "문학상", "작품상", "도서상", "소설상"}


def award_candidates(query: str) -> set[str] | None:
    """None means an ordinary search; an empty set means an unverified prize."""
    names = re.findall(r"([가-힣A-Za-z·]*(?:문학상|작품상|도서상|소설상|부커상|인터내셔널상|노벨상))", query)
    names += re.findall(r"\b([가-힣A-Za-z·]+상)(?:을|를)?\s*(?=수상작)", query)
    if not names and "수상작" not in query and not re.search(r"\b상(?:을)?\s*(?:받|탄)", query):
        return None
    specific = set(names) - _GENERIC_PRIZES
    winners = set()
    for isbn, aliases in _VERIFIED_AWARDS.items():
        matched = {alias.split()[-1] for alias in aliases if alias in query}
        if specific <= matched:
            winners.add(isbn)
    return winners


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def record_field(db, isbn, field, value, provider, policy_version, source_ref, checked_on):
    if not isbn or normalize_isbn(isbn) != isbn or field not in (*MODEL_FIELDS, "thumbnail"):
        raise ValueError("Invalid ISBN or field")
    if not value.strip() or not source_ref.strip() or checked_on > date.today():
        raise ValueError("Missing value, source reference, or valid check date")
    policy = (await db.execute(text("""
        SELECT active, uses FROM corpus_use_policy
        WHERE provider = :provider AND version = :version FOR SHARE
    """), {"provider": provider, "version": policy_version})).mappings().one_or_none()
    if not policy:
        raise CorpusPermissionError(HOLD_REASON)
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": isbn})
    current = (await db.execute(text("""
        SELECT * FROM corpus_field_versions WHERE isbn = :isbn AND field = :field AND current FOR UPDATE
    """), {"isbn": isbn, "field": field})).mappings().one_or_none()
    stored = value if permits(provider, policy["active"], policy["uses"], {"store"}) else None
    params = dict(isbn=isbn, field=field, provider=provider, policy_version=policy_version,
                  source_ref=source_ref, checked_on=checked_on, digest=digest(value), value=stored)
    if current and checked_on < current["checked_on"]:
        raise ValueError("Observation predates the current version")
    if current and all(current[key] == item for key, item in params.items() if key != "checked_on"):
        await db.execute(text("UPDATE corpus_field_versions SET checked_on = :day WHERE id = :id"),
                         {"day": checked_on, "id": current["id"]})
        return current["id"]
    if current:
        await db.execute(text("UPDATE corpus_field_versions SET current = false WHERE id = :id"), {"id": current["id"]})
    return (await db.execute(text("""
        INSERT INTO corpus_field_versions (isbn, field, provider, policy_version, source_ref, checked_on, digest, value)
        VALUES (:isbn, :field, :provider, :policy_version, :source_ref, :checked_on, :digest, :value)
        RETURNING id
    """), params)).scalar_one()


async def read_inputs(db, isbn, required):
    rows = (await db.execute(text("""
        SELECT f.id, f.field, f.value, f.digest, f.provider, p.active, p.uses
        FROM corpus_field_versions f JOIN corpus_use_policy p
          ON p.provider = f.provider AND p.version = f.policy_version
        WHERE f.isbn = :isbn AND f.current AND f.field IN ('title','authors','contents')
        ORDER BY f.field FOR SHARE OF f, p
    """), {"isbn": isbn})).mappings().all()
    fields = {}
    versions = []
    for row in rows:
        if not permits(row["provider"], row["active"], row["uses"], required):
            raise CorpusPermissionError(HOLD_REASON)
        value = row["value"]
        if value is None or digest(value) != row["digest"]:
            raise CorpusPermissionError(HOLD_REASON)
        fields[row["field"]] = value
        versions.append(str(row["id"]))
    if fields.keys() != set(MODEL_FIELDS):
        raise CorpusPermissionError(HOLD_REASON)
    return fields, ",".join(versions)


async def derived(db, isbn, required, kind, model, compute, context_key=""):
    # Serializes computation for a single ISBN, including concurrent backfill and ingest.
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": isbn})
    fields, version = await read_inputs(db, isbn, required)
    params = dict(isbn=isbn, version=version, kind=kind, model=model, context=context_key)
    cached = (await db.execute(text("""
        SELECT result FROM corpus_derived_artifacts WHERE
        (isbn,input_version,kind,model_version,context_key) = (:isbn,:version,:kind,:model,:context)
    """), params)).scalar_one_or_none()
    if cached is not None:
        return cached
    result = await compute(fields)
    if result is None:
        raise RuntimeError("Provider returned no artifact")
    await db.execute(text("""
        INSERT INTO corpus_derived_artifacts (isbn,input_version,kind,model_version,context_key,result)
        VALUES (:isbn,:version,:kind,:model,:context,CAST(:result AS jsonb))
    """), {**params, "result": json.dumps(result, allow_nan=False)})
    return result


async def index_reviewed(db, isbn):
    from app.corpus_policy import MODEL_USES, EMBEDDING_USES
    from app.services import embedding_backend
    from app.services.gemini_tagger import GeminiTagger
    from app.services.text_utils import build_book_text

    tagger = GeminiTagger()

    async def classify(fields):
        return await tagger._classify(**fields)

    async def embed(fields):
        return await embedding_backend._embed(build_book_text(**fields), "RETRIEVAL_DOCUMENT")

    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": isbn})
    await read_inputs(db, isbn, EMBEDDING_USES)
    await derived(db, isbn, MODEL_USES, "tags", tagger.model, classify)
    await derived(db, isbn, EMBEDDING_USES, "embedding", embedding_backend.GEMINI_EMBEDDING_MODEL, embed)


async def rank_reviewed(db, query, isbns, outcome=None, requested_form="ANY", checked_form=False):
    """All model inputs are reconstructed inside this transaction, including fallback candidates."""
    from app.corpus_policy import MODEL_USES
    from app.services import reranker

    versions = {}
    fields = {}
    for isbn in sorted(set(isbns)):
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": isbn})
        fields[isbn], versions[isbn] = await read_inputs(db, isbn, MODEL_USES)
    refs = {f"B{i}": isbn for i, isbn in enumerate(dict.fromkeys(isbns), 1)}
    candidates = [{"isbn": ref, **fields[isbn]} for ref, isbn in refs.items()]
    results = await reranker._rank_candidates(query, candidates, requested_form=requested_form, outcome=outcome,
                                               verified_fallback=candidates if checked_form else None)
    context = digest(json.dumps([query, list(refs.values()), versions], sort_keys=True))
    books = []
    for row in results:
        isbn = refs[row["isbn"]]
        book = {**row, "isbn": isbn}
        if "reason" in book:
            model = reranker.GROQ_RERANK_MODEL if book.get("ranking_status") == "GROQ" else reranker.RERANK_MODEL
            async def reason(_fields):
                return {"reason": book["reason"], "evidence": book["reason_evidence"]}
            receipt = await derived(db, isbn, MODEL_USES, "reason", model, reason, context)
            book.update(reason=receipt["reason"], reason_evidence=receipt["evidence"])
        books.append(book)
    return books


async def search_reviewed(db, query, outcome=None):
    """Pilot retrieval in the reviewed embedding space, limited to current, permitted inputs."""
    from app.corpus_policy import EMBEDDING_USES
    from app.services import embedding_backend
    from app.services.intent_classifier import IntentAnalyzer
    from app.services.reference_search import exclude_comparison_work

    if outcome is not None:
        outcome.update(status="NO_MATCH", reason_code="NO_VERIFIED_CANDIDATES")
    isbns = (await db.execute(text("""
        SELECT DISTINCT isbn FROM corpus_derived_artifacts WHERE kind='embedding' AND model_version=:model
        ORDER BY isbn
    """), {"model": embedding_backend.GEMINI_EMBEDDING_MODEL})).scalars().all()
    from app.services.gemini_tagger import GEMINI_DEFAULT_MODEL
    intent = await IntentAnalyzer().analyze(query)
    winners = award_candidates(query)
    practical = intent.requested_form == "PRACTICAL" or (
        intent.requested_form != "STORY" and (intent.domain in {"비즈니스", "금융", "심리", "자기계발"} or "저축" in query)
    )
    vectors = []
    for isbn in isbns:
        if winners is not None and isbn not in winners:
            continue
        try:
            fields, version = await read_inputs(db, isbn, EMBEDDING_USES)
        except CorpusPermissionError:
            continue
        artifacts = (await db.execute(text("""
            SELECT e.result AS vector, t.result AS tags FROM corpus_derived_artifacts e
            JOIN corpus_derived_artifacts t USING(isbn,input_version)
            WHERE e.isbn=:isbn AND e.input_version=:version AND e.kind='embedding'
              AND e.model_version=:model AND t.kind='tags' AND t.model_version=:tag
        """), {"isbn": isbn, "version": version, "model": embedding_backend.GEMINI_EMBEDDING_MODEL,
               "tag": GEMINI_DEFAULT_MODEL})).mappings().one_or_none()
        if artifacts is None:
            continue
        if practical and artifacts["tags"].get("book_type") not in {"NONFICTION", "PRACTICAL", "EDUCATIONAL"}:
            continue
        if intent.requested_form == "STORY" and artifacts["tags"].get("book_type") != "STORY":
            continue
        vectors.append((isbn, fields, artifacts["vector"]))
    if intent.reference_author:
        anchors = [v for _, f, v in vectors if intent.reference_author == f["authors"]]
        if not anchors:
            return []
        qv = [sum(values)/len(anchors) for values in zip(*anchors)]
        vectors = [item for item in vectors if item[1]["authors"] != intent.reference_author]
    else:
        author = intent.focus_author
        for _, fields, _ in vectors:
            name = fields["authors"]
            if query.startswith((name + " 작가가 쓴", name + " 작가가 지은")):
                author = name
                break
        if author:
            vectors = [item for item in vectors if item[1]["authors"] == author]
        if not vectors:
            return []
        qv = await embedding_backend._embed(query, "RETRIEVAL_QUERY")
    vectors.sort(key=lambda item: sum(a*b for a,b in zip(qv, item[2])), reverse=True)
    candidates = [{"isbn": isbn, **fields} for isbn, fields, _ in vectors]
    selected = exclude_comparison_work(query, candidates)[:10]
    return await rank_reviewed(db, query, [book["isbn"] for book in selected], outcome,
                               "PRACTICAL" if practical else intent.requested_form, checked_form=True)
