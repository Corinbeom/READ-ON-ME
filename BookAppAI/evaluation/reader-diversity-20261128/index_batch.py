"""Index local reviewed editions in small Gemini requests. Resume using versioned artifacts."""

import argparse
import asyncio
from collections import Counter
import json
import os
from pathlib import Path
import time

import httpx
from sqlalchemy import text

from app import database
from app.corpus_policy import EMBEDDING_USES
from app.services.corpus_quality import preflight_candidate, validate_classification
from app.services.embedding_backend import (
    EMBEDDING_DIMENSIONS,
    GEMINI_EMBEDDING_MODEL,
    normalize,
)
from app.services.gemini_tagger import (
    CLASSIFICATION_SCHEMA,
    GEMINI_DEFAULT_MODEL,
    GeminiTagger,
    PROMPT_TEMPLATE,
)
from app.services.reviewed_corpus import read_input_batch
from app.services.text_utils import build_book_text

CLASSIFICATION_BASE = "https://generativelanguage.googleapis.com/v1/models/"
EMBEDDING_BASE = "https://generativelanguage.googleapis.com/v1beta/models/"
ITEM = {
    "type": "OBJECT",
    "properties": {"ref": {"type": "STRING"}, **CLASSIFICATION_SCHEMA["properties"]},
    "required": ["ref", *CLASSIFICATION_SCHEMA["required"]],
}
SCHEMA = {
    "type": "OBJECT",
    "properties": {"books": {"type": "ARRAY", "items": ITEM}},
    "required": ["books"],
}
TAGGER = GeminiTagger()
INSTRUCTIONS = PROMPT_TEMPLATE.split("입력 정보:")[0].replace(
    "아래 책 정보를 읽고", "각 책의 자료만 따로 읽고"
)
INSTRUCTIONS += (
    "\n각 ref에 대해 결과를 하나씩 books 배열에 넣어라. 책 사이에 정보를 섞지 마라. "
    "증거는 해당 책의 소개에서만 그대로 복사하고, 출처표시를 근거로 사용하지 마라. "
    "부제와 서지 주제어만 있는 책에서 줄거리나 독자 연령을 추측하지 마라.\n"
)


async def request(client, method, body):
    base = (
        CLASSIFICATION_BASE if method.endswith(":generateContent") else EMBEDDING_BASE
    )
    delays = (10, 30, 60, 120)
    for attempt in range(len(delays) + 1):
        try:
            response = await client.post(base + method, json=body)
        except (httpx.TimeoutException, httpx.NetworkError):
            if attempt == len(delays):
                raise RuntimeError(f"Network unavailable for {method}") from None
            await asyncio.sleep(delays[attempt])
            continue
        if response.is_success:
            return response.json()
        try:
            detail = response.json().get("error", {})
        except (ValueError, AttributeError):
            detail = {}
        # Print only error codes, quota names and retry intervals, never the request.
        quotas = [
            v.get("quotaId") or v.get("quotaMetric", "")
            for d in detail.get("details", [])
            for v in d.get("violations", [])
        ]
        print(
            "provider",
            method,
            response.status_code,
            detail.get("status"),
            quotas,
            flush=True,
        )
        if response.status_code == 429 and any("day" in q.lower() for q in quotas):
            raise RuntimeError("Daily quota exhausted for " + method)
        if response.status_code not in (429, 500, 502, 503, 504) or attempt == len(
            delays
        ):
            raise RuntimeError(
                f"{method} returned HTTP {response.status_code}: {detail.get('status')}"
            )
        await asyncio.sleep(
            max(
                61 if response.status_code == 429 else delays[attempt],
                int(response.headers.get("retry-after", 0)),
            )
        )
    raise RuntimeError("Upstream request unavailable")


async def classify(client, inputs):
    refs = {f"B{j}": isbn for j, isbn in enumerate(inputs, 1)}
    books = [
        dict(
            ref=k,
            title=inputs[i][0]["title"],
            authors=inputs[i][0]["authors"],
            contents=TAGGER._truncate(inputs[i][0]["contents"].split("\n\n출처:")[0]),
        )
        for k, i in refs.items()
    ]
    result = await request(
        client,
        GEMINI_DEFAULT_MODEL + ":generateContent",
        {
            "contents": [
                {
                    "parts": [
                        {"text": INSTRUCTIONS + json.dumps(books, ensure_ascii=False)}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
                "responseSchema": SCHEMA,
            },
        },
    )
    parts = result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    parsed = json.loads(
        "".join(p.get("text", "") for p in parts if not p.get("thought"))
    ).get("books", [])
    found = Counter(row.get("ref") for row in parsed)
    if set(found) - refs.keys():
        raise ValueError("Unexpected model response identifiers")
    accepted = {}
    reasons = {}
    for row in parsed:
        ref = row.get("ref")
        isbn = refs[ref]
        if found[ref] != 1:
            continue
        data = TAGGER._parse_response(
            {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {k: v for k, v in row.items() if k != "ref"},
                                        ensure_ascii=False,
                                    )
                                }
                            ]
                        }
                    }
                ]
            }
        )
        fields = inputs[isbn][0]
        grounded = dict(fields, contents=fields["contents"].split("\n\n출처:")[0])
        status, why, *_ = validate_classification(grounded, data or {})
        if status == "ACTIVE":
            accepted[isbn] = data
        else:
            reasons[isbn] = why
    for isbn in set(inputs) - accepted.keys() - reasons.keys():
        reasons[isbn] = "MISSING_OR_DUPLICATE_RESULT"
    return accepted, reasons


async def locked_fields(db, ids, expected):
    await db.execute(
        text("""SELECT pg_advisory_xact_lock(hashtextextended(isbn,0))
        FROM (SELECT unnest(CAST(:ids AS text[])) AS isbn ORDER BY isbn) ordered"""),
        {"ids": ids},
    )
    inputs = await read_input_batch(db, ids, EMBEDDING_USES)
    if set(inputs) != set(ids) or any(
        observation != expected[i] for i, observation in inputs.items()
    ):
        raise ValueError("The reviewed manifest or its field permissions have changed")
    return inputs


async def cached(db, inputs, kind, model):
    rows = await db.execute(
        text("""SELECT a.isbn,a.result FROM corpus_derived_artifacts a
        JOIN unnest(CAST(:ids AS text[]), CAST(:versions AS text[])) AS f(isbn,v)
          ON a.isbn=f.isbn AND a.input_version=f.v
        WHERE kind=:kind AND model_version=:model AND context_key=''"""),
        dict(
            ids=list(inputs),
            versions=[v for _, v in inputs.values()],
            kind=kind,
            model=model,
        ),
    )
    return dict(rows.all())


async def store_artifacts(db, inputs, kind, model, results):
    if not results:
        return
    args = [
        dict(
            isbn=i,
            version=inputs[i][1],
            kind=kind,
            model=model,
            result=json.dumps(v, ensure_ascii=False, allow_nan=False),
        )
        for i, v in results.items()
    ]
    await db.execute(
        text("""INSERT INTO corpus_derived_artifacts
        (isbn,input_version,kind,model_version,context_key,result)
        VALUES (:isbn,:version,:kind,:model,'',CAST(:result AS jsonb))"""),
        args,
    )


async def admit(client, ids, expected, decisions):
    async with database.async_session() as db, db.begin():
        inputs = await locked_fields(db, ids, expected)
        tagged = await cached(db, inputs, "tags", GEMINI_DEFAULT_MODEL)
        pending = {
            i: v
            for i, v in inputs.items()
            if i not in tagged and decisions.get(i, [None])[0] != v[1]
        }
        if not pending:
            return list(tagged), {}
        for i, (fields, _) in pending.items():
            if preflight_candidate(dict(isbn=i, **fields)):
                raise ValueError("Ineligible edition " + i)
        results, held = await classify(client, pending)
        await store_artifacts(db, inputs, "tags", GEMINI_DEFAULT_MODEL, results)
        return [*tagged, *results], {
            i: [inputs[i][1], reason] for i, reason in held.items()
        }


async def embed(client, ids, expected):
    if not ids:
        return 0
    async with database.async_session() as db, db.begin():
        inputs = await locked_fields(db, ids, expected)
        approved = await cached(db, inputs, "tags", GEMINI_DEFAULT_MODEL)
        if set(approved) != set(inputs):
            raise ValueError("A current classification is required")
        # Only the date-specific, evidence-checked manifests may supply new document vectors.
        for i, tags in approved.items():
            fields = inputs[i][0]
            if (
                validate_classification(
                    dict(fields, contents=fields["contents"].split("\n\n출처:")[0]),
                    tags,
                )[0]
                != "ACTIVE"
            ):
                raise ValueError("Classification no longer passes admission")
        complete = await cached(db, inputs, "embedding", GEMINI_EMBEDDING_MODEL)
        pending = [i for i in ids if i not in complete]
        if not pending:
            return 0
        model = "models/" + GEMINI_EMBEDDING_MODEL
        requests = [
            {
                "model": model,
                "content": {"parts": [{"text": build_book_text(**inputs[i][0])}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": EMBEDDING_DIMENSIONS,
            }
            for i in pending
        ]
        data = await request(
            client,
            GEMINI_EMBEDDING_MODEL + ":batchEmbedContents",
            {"requests": requests},
        )
        vectors = [normalize(v["values"]) for v in data["embeddings"]]
        await store_artifacts(
            db,
            inputs,
            "embedding",
            GEMINI_EMBEDDING_MODEL,
            dict(zip(pending, vectors, strict=True)),
        )
        return len(pending)


async def run(manifest, decisions, chunk, tags_only, limit):
    if not 1 <= chunk <= 25 or (limit is not None and limit <= 0):
        raise ValueError("Invalid batch size or document allowance")
    expected = {}
    source_facts = {}
    for row in json.loads(manifest.read_text()):
        fields = expected.setdefault(row["isbn"], {})
        if row["field"] in fields:
            raise ValueError("Repeated field in manifest")
        fields[row["field"]] = row["value"]
        source_facts[(row["isbn"], row["field"])] = (
            row["provider"],
            row["policy_version"],
            row["source_ref"],
            row["checked_on"],
        )
    ids = list(expected)
    done = json.loads(decisions.read_text()) if decisions.exists() else {}
    database.init_db()
    try:
        async with database.async_session() as db:
            versions = await read_input_batch(db, ids, EMBEDDING_USES)
            if set(versions) != set(expected) or any(
                f != expected[i] for i, (f, _) in versions.items()
            ):
                raise ValueError(
                    "Manifest is incomplete or differs from reviewed fields"
                )
            provenance = await db.execute(
                text("""SELECT isbn,field,provider,policy_version,source_ref,checked_on
                FROM corpus_field_versions WHERE current AND isbn=ANY(:ids)
                AND field IN ('title','authors','contents') FOR SHARE"""),
                {"ids": ids},
            )
            observed = {
                (isbn, field): (provider, policy, ref, day.isoformat())
                for isbn, field, provider, policy, ref, day in provenance
            }
            if observed != source_facts:
                raise ValueError(
                    "Field source, policy or observation date differs from manifest"
                )
            existing = await cached(
                db,
                versions,
                "tags" if tags_only else "embedding",
                GEMINI_DEFAULT_MODEL if tags_only else GEMINI_EMBEDDING_MODEL,
            )
            ids = [
                i
                for i in ids
                if i not in existing and done.get(i, [None])[0] != versions[i][1]
            ]
        if limit is not None:
            ids = ids[:limit]
        print("remaining in this run", len(ids), flush=True)
        async with httpx.AsyncClient(
            headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]}, timeout=90
        ) as client:
            previous = 0
            for start in range(0, len(ids), chunk):
                await asyncio.sleep(
                    max(
                        0,
                        previous
                        + (12 if tags_only else max(12, 1.5 * chunk))
                        - time.monotonic(),
                    )
                )
                previous = time.monotonic()
                group = ids[start : start + chunk]
                admitted, held = await admit(client, group, versions, done)
                done.update(held)
                tmp = decisions.with_suffix(".tmp")
                tmp.write_text(json.dumps(done, ensure_ascii=False))
                tmp.replace(decisions)
                indexed = 0 if tags_only else await embed(client, admitted, versions)
                print(
                    start,
                    len(admitted),
                    "admitted",
                    len(done),
                    "held",
                    indexed,
                    "new embeddings",
                    flush=True,
                )
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("decisions", type=Path)
    parser.add_argument("--chunk", type=int, default=16)
    parser.add_argument(
        "--tags-only",
        action="store_true",
        help="Verify classifications without consuming document embedding quota",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Maximum number of remaining editions attempted in this run",
    )
    args = parser.parse_args()
    asyncio.run(
        run(args.manifest, args.decisions, args.chunk, args.tags_only, args.limit)
    )
