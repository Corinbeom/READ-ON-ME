"""Transfer additions between two verified Galpi corpora, keeping staging invisible."""
import argparse
import asyncio
import json
import sys
from collections import defaultdict

from sqlalchemy import text

from app import database
from app.corpus_policy import EMBEDDING_USES, MODEL_FIELDS, permits
from app.services.reviewed_corpus import digest
from app.services.embedding_backend import GEMINI_EMBEDDING_MODEL
from app.services.gemini_tagger import GEMINI_DEFAULT_MODEL
from app.services.reviewed_release import configured_release, fingerprint, load_index, require_release


def require(condition, message):
    if not condition:
        raise ValueError(message)


async def editions(db):
    index = await load_index(db, with_vectors=False)
    return {isbn: [b.version, b.tags_digest, b.vector_digest] for isbn, b in index.items()}


async def inventory(db, release):
    await require_release(db, release)
    return {"release": release, "editions": await editions(db)}


def additions(base, target):
    require(all(target.get(i) == v for i, v in base.items()), "Existing editions differ or are missing")
    return {i: v for i, v in target.items() if i not in base}


async def rows(db, query, **params):
    records = await db.scalars(text("SELECT to_jsonb(r)::text FROM (" + query + ") r"), params)
    return [json.loads(record) for record in records]


async def export(db, base):
    release, _ = await fingerprint(db)
    target = await inventory(db, release)
    new = additions(base["editions"], target["editions"])
    require(new, "No new editions")
    ids = [int(fid) for version, _, _ in new.values() for fid in version.split(",")]
    fields = await rows(db, "SELECT * FROM corpus_field_versions WHERE id=ANY(:ids) AND current ORDER BY id", ids=ids)
    for row in fields:
        row["current"] = False
    policies = await rows(db, """SELECT p.* FROM corpus_use_policy p WHERE EXISTS
        (SELECT 1 FROM corpus_field_versions f WHERE f.id=ANY(:ids) AND
         (f.provider,f.policy_version)=(p.provider,p.version)) ORDER BY provider,version""", ids=ids)
    artifacts = await rows(db, """SELECT a.isbn,a.input_version,a.kind,a.model_version,a.context_key,
        a.result::text AS result_json FROM corpus_derived_artifacts a
        JOIN unnest(CAST(:isbns AS text[]),CAST(:versions AS text[])) n(isbn,version)
          ON (a.isbn,a.input_version)=(n.isbn,n.version)
        WHERE a.context_key='' AND ((a.kind='embedding' AND a.model_version=:embedding)
        OR (a.kind='tags' AND a.model_version=:tag)) ORDER BY a.isbn,a.kind""",
        isbns=list(new), versions=[v[0] for v in new.values()], embedding=GEMINI_EMBEDDING_MODEL, tag=GEMINI_DEFAULT_MODEL)
    runs = await rows(db, """SELECT * FROM corpus_quality_runs WHERE release=:release
        ORDER BY checked_at DESC,run_id DESC LIMIT 2""", release=release)
    bundle = dict(base=base, release=release, additions=new, policies=policies, fields=fields, artifacts=artifacts, runs=runs)
    validate(bundle)
    return bundle


def validate(bundle):
    new = bundle["additions"]
    require(new and not (new.keys() & bundle["base"]["editions"].keys()), "Expected new ISBNs only")
    fields = defaultdict(dict)
    policies = set()
    ids = set()
    for f in bundle["fields"]:
        isbn, name, fid = f["isbn"], f["field"], f["id"]
        require(isbn in new and not f["current"] and fid not in ids and name not in fields[isbn], "Invalid staged field")
        require(isinstance(f["value"], str) and digest(f["value"]) == f["digest"], "Invalid field value")
        ids.add(fid)
        fields[isbn][name] = fid
        policies.add((f["provider"], f["policy_version"]))
    require(policies == {(p["provider"], p["version"]) for p in bundle["policies"]}, "Unexpected policy set")
    require(all(permits(p["provider"], p["active"], p["uses"], EMBEDDING_USES) for p in bundle["policies"]),
            "Staged policy does not permit indexed recommendations")
    for isbn, (version, _, _) in new.items():
        require(set(fields[isbn]) == set(MODEL_FIELDS), "Incomplete edition")
        require(version == ",".join(str(fields[isbn][f]) for f in sorted(MODEL_FIELDS)), "Input version differs")
    expected = {(isbn, v[0], kind, "") for isbn, v in new.items() for kind in ("tags", "embedding")}
    actual = [(a["isbn"], a["input_version"], a["kind"], a["context_key"]) for a in bundle["artifacts"]]
    require(set(actual) == expected and len(actual) == len(expected), "Unexpected derived artifacts")
    runs = bundle["runs"]
    require(len(runs) == len({r["run_id"] for r in runs}) == 2 and all(
        r["release"] == bundle["release"] and r["first_match"] >= 13 and r["any_match"] >= 15 and r["controls"] == 2
        for r in runs), "Two passing runs for the target release required")


async def insert_exact(db, table, source, records, scope, *, identity=False):
    # Every table name and source query here comes from the stage function.
    params = {"records": json.dumps(records, ensure_ascii=False)}
    override = " OVERRIDING SYSTEM VALUE" if identity else ""
    await db.execute(text(f"INSERT INTO {table}{override} {source} ON CONFLICT DO NOTHING"), params)
    differ = await db.scalar(text(f"""WITH incoming AS ({source})
        SELECT EXISTS (SELECT * FROM incoming EXCEPT
          SELECT t.* FROM {table} t WHERE {scope} IN (SELECT {scope} FROM incoming))"""), params)
    require(not differ, f"Existing {table} row differs from the bundle")


async def stage(db, b):
    old = b["base"]
    require(configured_release() == old["release"], "Different live release")
    require(await inventory(db, old["release"]) == old, "Baseline changed")
    # Reject pre-existing history for these ISBNs unless it is our exact staged batch.
    current = await rows(db, "SELECT * FROM corpus_field_versions WHERE isbn=ANY(:isbns) ORDER BY id",
                         isbns=list(b["additions"]))
    require(not current or current == sorted(b["fields"], key=lambda f: f["id"]), "New ISBN has conflicting history")
    for table, key, scope in (("corpus_use_policy", "policies", "provider"), ("corpus_field_versions", "fields", "id"),
                              ("corpus_derived_artifacts", "artifacts", "isbn"), ("corpus_quality_runs", "runs", "run_id")):
        source = f"SELECT * FROM jsonb_populate_recordset(NULL::{table},CAST(:records AS jsonb))"
        if key == "artifacts":
            source = """SELECT isbn,input_version,kind,model_version,context_key,CAST(result_json AS jsonb)
                 FROM jsonb_to_recordset(CAST(:records AS jsonb)) AS x(isbn text,input_version text,
                 kind text,model_version text,context_key text,result_json text)"""
        await insert_exact(db, table, source, b[key], scope, identity=key == "fields")
    await db.execute(text("""SELECT setval(pg_get_serial_sequence('corpus_field_versions','id'),
        greatest((SELECT max(id) FROM corpus_field_versions),
                 (SELECT last_value FROM corpus_field_versions_id_seq)))"""))
    require(await inventory(db, old["release"]) == old, "Staging changed the live corpus")


async def switch(db, b, active):
    base = b["base"]["editions"]
    target = {**base, **b["additions"]}
    existing = await editions(db)
    require(existing == base or existing == target, "Corpus has changed since the bundle was prepared")
    if active:
        require(configured_release() == b["release"], "Target release is not configured")
    ids = [f["id"] for f in b["fields"]]
    # Match the full stored fields on retry and rollback, including inactive rows.
    stored = await rows(db, "SELECT * FROM corpus_field_versions WHERE isbn=ANY(:isbns) ORDER BY id",
                        isbns=list(b["additions"]))
    expected = sorted(b["fields"], key=lambda f: f["id"])
    require(stored == [dict(f, current=(existing == target)) for f in expected], "Staged data differs")
    await db.execute(text("UPDATE corpus_field_versions SET current=:active WHERE id=ANY(:ids) AND current<>:active"),
                     {"active": active, "ids": ids})
    if active:
        require(await inventory(db, b["release"]) == {"release": b["release"], "editions": target}, "Target mismatch")
    else:
        require(await editions(db) == base, "Original corpus was not restored")


async def run(command, payload=None):
    database.init_db()
    try:
        async with database.async_session() as db, db.begin():
            if command == "inventory":
                return await inventory(db, configured_release())
            if command == "export":
                return await export(db, payload)
            validate(payload)
            await db.execute(text("SET LOCAL lock_timeout='10s'"))
            await db.execute(text("""LOCK TABLE corpus_use_policy,corpus_field_versions,corpus_derived_artifacts,
                corpus_quality_runs IN SHARE ROW EXCLUSIVE MODE"""))
            if command == "stage":
                await stage(db, payload)
            else:
                await switch(db, payload, command == "activate")
            return {"operation": command, "editions": len(payload["additions"]), "release": payload["release"]}
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("inventory", "export", "stage", "activate", "rollback"))
    args = parser.parse_args()
    result = asyncio.run(run(args.command, None if args.command == "inventory" else json.load(sys.stdin)))
    print(json.dumps(result, ensure_ascii=False))
