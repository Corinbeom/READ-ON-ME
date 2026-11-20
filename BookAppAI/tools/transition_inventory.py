"""Inventory legacy fields. Only an explicitly approved manifest can change matching rows."""

import argparse
from collections import Counter
from hashlib import sha256
import json
import os
import subprocess
from pathlib import Path

import psycopg2


# SQL identifiers and replacement expressions always come from this registry.
CATALOG = {
    "books": dict.fromkeys(("title", "authors", "contents", "thumbnail", "publisher", "group_title",
                            "translators", "publish_date", "price", "sale_price", "url"), "NULL"),
    "popular_naru_books": {"book_image_url": "NULL"},
    "ai_search_jobs": {"result_json": "NULL"},
    "recommendation_feedback": {"books": """(SELECT coalesce(jsonb_agg(
        jsonb_build_object('isbn', item->'isbn') ORDER BY pos), '[]'::jsonb)
        FROM jsonb_array_elements(t.books) WITH ORDINALITY elements(item,pos))"""},
}
AI = {
    "book_corpus": dict.fromkeys(("authors", "contents", "publisher", "thumbnail", "tags", "embedding",
                                  "gemini_embedding"), "NULL"),
    "corpus_ingestion_jobs": {"payload": "'{}'::jsonb"},
}
LINKED = """EXISTS(SELECT 1 FROM user_book_status u WHERE u.book_id=t.id)
         OR EXISTS(SELECT 1 FROM book_review r WHERE r.book_id=t.id)"""
STAMP = "encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex')"
PROTECTED = {
    "user_book_status": "to_jsonb(t)",
    "book_review": "to_jsonb(t)",
    "review_like": "to_jsonb(t)",
    "books": "jsonb_build_array(id,isbn13,average_rating,embedded)",
    "recommendation_feedback": """(to_jsonb(t)-'books') || jsonb_build_object('isbns',
        (SELECT jsonb_agg(item->'isbn' ORDER BY pos) FROM jsonb_array_elements(books) WITH ORDINALITY e(item,pos)))""",
}


def guards(cur, scope):
    if scope != "catalog":
        return {}
    fingerprints = {}
    for table, expr in PROTECTED.items():
        cur.execute(f"SELECT id, encode(sha256(convert_to(({expr})::text, 'UTF8')), 'hex') FROM {table} t ORDER BY id")
        fingerprint = sha256()
        count = 0
        for key, stamp in cur:
            fingerprint.update(f"{key}:{stamp}\n".encode())
            count += 1
        fingerprints[table] = {"rows": count, "digest": fingerprint.hexdigest()}
    return fingerprints


def target_fields(table):
    return (CATALOG | AI)[table]


def flags(table):
    return LINKED if table == "books" else "false"


def inspect(cur, scope):
    tables = CATALOG if scope == "catalog" else AI
    rows = []
    counts = Counter()
    for table, fields in tables.items():
        differs = ", ".join(f"t.{key} IS DISTINCT FROM ({value})" for key, value in fields.items())
        patch = ", ".join(f"'{field}', ({value})" for field, value in fields.items())
        after = f"encode(sha256(convert_to((to_jsonb(t)||jsonb_build_object({patch}))::text,'UTF8')),'hex')"
        cur.execute(f"SELECT t.id::text, {STAMP}, {after}, ({flags(table)}), {differs} FROM {table} t ORDER BY t.id")
        for key, stamp, after, linked, *present in cur:
            selected = []
            for field, has_value in zip(fields, present):
                if not has_value:
                    counts[f"{table}.{field}/유지/정리할 값 없음"] += 1
                    continue
                if table == "books" and linked:
                    action, reason = "재확보", "사용자 기록 연결 · 상세 조회에서 재확보"
                elif table == "book_corpus":
                    action, reason = "사용 보류", "기존 입력과 모델 버전 미검증"
                else:
                    action, reason = "정리 대상", "출처 또는 해당 사용 근거 미검증"
                counts[f"{table}.{field}/{action}/{reason}"] += 1
                if action != "사용 보류":
                    selected.append(field)
            rows.append(dict(table=table, id=key, stamp=stamp, after=after, linked=linked, fields=selected))
    if scope == "ai":
        cur.execute("SELECT status,count(*) FROM book_tagging_jobs GROUP BY status")
        for status, count in cur:
            counts[f"book_tagging_jobs.status/사용 보류/{status}"] = count
        cur.execute("SELECT count(*) FROM book_corpus")
        n = cur.fetchone()[0]
        for field in ("title", "keyword"):
            counts[f"book_corpus.{field}/사용 보류/기존 입력과 모델 버전 미검증"] = n
    return rows, counts


def verified_distribution(cur):
    cur.execute("SELECT to_regclass('corpus_field_versions')")
    if not cur.fetchone()[0]:
        return {}

    from app.corpus_policy import EMBEDDING_USES, MODEL_FIELDS, permits
    from app.services.embedding_backend import GEMINI_EMBEDDING_MODEL
    from app.services.gemini_tagger import GEMINI_DEFAULT_MODEL

    cur.execute("""
        SELECT f.isbn, f.field, f.id, p.provider, p.active, p.uses, f.value IS NOT NULL
          AND f.digest = encode(sha256(convert_to(f.value, 'UTF8')), 'hex')
        FROM corpus_field_versions f JOIN corpus_use_policy p
        ON (p.provider,p.version)=(f.provider,f.policy_version) WHERE f.current ORDER BY f.isbn, f.field
    """)
    versions = {}
    for isbn, field, version, provider, active, uses, matches in cur:
        if field in MODEL_FIELDS and matches and permits(provider, active, uses, EMBEDDING_USES):
            versions.setdefault(isbn, {})[field] = str(version)
    genres = Counter()
    for isbn, fields in versions.items():
        if fields.keys() != set(MODEL_FIELDS):
            continue
        version = ",".join(fields[key] for key in sorted(fields))
        cur.execute("""
            SELECT tags.result->>'primary_keyword' FROM corpus_derived_artifacts tags
            JOIN corpus_derived_artifacts e USING (isbn,input_version)
            WHERE tags.isbn=%s AND tags.input_version=%s AND tags.kind='tags' AND tags.model_version=%s
              AND e.kind='embedding' AND e.model_version=%s
        """, (isbn, version, GEMINI_DEFAULT_MODEL, GEMINI_EMBEDDING_MODEL))
        result = cur.fetchone()
        if result:
            genres[result[0] or "미분류"] += 1
    return dict(genres)


def cache_inventory():
    host = os.environ.get("TRANSITION_REDIS_HOST")
    if not host:
        return {"status": "uninspected"}
    command = ["redis-cli", "--json", "-h", host, "-p", os.getenv("TRANSITION_REDIS_PORT", "6379"),
               "-n", os.getenv("TRANSITION_REDIS_DB", "0")]
    scan = """
        local page=redis.call('SCAN',ARGV[1],'MATCH',ARGV[2],'COUNT',200)
        local expiring, permanent, maximum=0,0,0
        for _,key in ipairs(page[2]) do
            local ttl=redis.call('TTL',key)
            if ttl>=0 then expiring=expiring+1; maximum=math.max(maximum,ttl)
            elseif ttl==-1 then permanent=permanent+1 end
        end
        return {page[1],expiring,permanent,maximum}
    """
    result = {}
    for prefix in ("bookSearchCache", "popularBooksCache"):
        cursor, expiring, permanent, maximum = "0", 0, 0, 0
        while True:
            response = subprocess.check_output(command + ["EVAL_RO", scan, "0", cursor, prefix+"::*"], timeout=10)
            cursor, count, no_ttl, ttl = json.loads(response)
            expiring += count
            permanent += no_ttl
            maximum = max(maximum, ttl)
            if cursor == "0":
                break
        result[prefix] = dict(expiring=expiring, permanent=permanent, max_ttl_seconds=maximum)
    return {"status": "scanned", "approximate": True, "namespaces": result}


def catalog_links(cur):
    cur.execute("""
        SELECT shelf, review, count(*) FROM (
            SELECT EXISTS(SELECT 1 FROM user_book_status s WHERE s.book_id=b.id) shelf,
                   EXISTS(SELECT 1 FROM book_review r WHERE r.book_id=b.id) review FROM books b
        ) links GROUP BY shelf,review
    """)
    names = {(True,True): "shelf_and_review", (True,False): "shelf_only",
             (False,True): "review_only", (False,False): "no_current_user_link"}
    totals = dict.fromkeys(names.values(), 0)
    for shelf, review, count in cur:
        totals[names[shelf, review]] = count
    return totals


def database_identity(cur):
    cur.execute("SELECT current_database(),current_schema(),oid FROM pg_database WHERE datname=current_database()")
    db, schema, oid = cur.fetchone()
    cur.execute("SELECT has_function_privilege(current_user,'pg_control_system()','EXECUTE')")
    if cur.fetchone()[0]:
        cur.execute("SELECT system_identifier::text FROM pg_control_system()")
        cluster = cur.fetchone()[0]
    else:
        cluster = os.environ.get("TRANSITION_CLUSTER_ID")
    return dict(database=db, schema=schema, oid=oid, cluster=cluster)


def report(cur, scope):
    identity = database_identity(cur)
    cur.execute("SELECT transaction_timestamp()::text")
    at = cur.fetchone()[0]
    rows, counts = inspect(cur, scope)
    return dict(format=2, identity=identity, at=at, scope=scope, counts=dict(counts),
                protected=guards(cur, scope),
                book_links=catalog_links(cur) if scope == "catalog" else {},
                cache=cache_inventory() if scope == "catalog" else {},
                verified_by_genre=verified_distribution(cur) if scope == "ai" else {}, rows=rows)


def apply_chunk(cur, scope, rows):
    result = Counter()
    protected = guards(cur, scope)
    for row in rows:
        table = row["table"]
        tables = CATALOG if scope == "catalog" else AI
        if table not in tables or not set(row["fields"]).issubset(tables[table]):
            raise ValueError("Unknown table or field")
        if not row["fields"]:
            continue
        if table == "book_corpus":
            raise ValueError("Held corpus requires separate rights review")
        fields = target_fields(table)
        cur.execute(f"SELECT {STAMP}, ({flags(table)}) FROM {table} t WHERE id::text=%s FOR UPDATE", (row["id"],))
        current = cur.fetchone()
        if current == (row["after"], row["linked"]):
            result["already_applied"] += 1
            continue
        if not current or current != (row["stamp"], row["linked"]):
            result["skipped_changed"] += 1
            continue
        if table == "corpus_ingestion_jobs":
            cur.execute("SELECT status FROM corpus_ingestion_jobs WHERE id=%s", (row["id"],))
            if cur.fetchone()[0] in ("PENDING", "RUNNING", "RETRY"):
                result["skipped_live_job"] += 1
                continue
        assignments = ", ".join(f"{field}={fields[field]}" for field in row["fields"])
        cur.execute(f"UPDATE {table} AS t SET {assignments} WHERE id::text=%s", (row["id"],))
        result["applied"] += cur.rowcount
    if guards(cur, scope) != protected:
        raise RuntimeError("Protected records changed within the cleanup transaction")
    return result


def main(args):
    dsn = os.environ["TRANSITION_DATABASE_URL"]
    connection = psycopg2.connect(dsn)
    try:
        connection.set_session(isolation_level="REPEATABLE READ", readonly=args.apply is None)
        if args.apply is None:
            with connection, connection.cursor() as cur:
                inventory = report(cur, args.scope)
            with args.output.open("x") as output:
                json.dump(inventory, output, ensure_ascii=False, indent=2)
            return {"counts": inventory["counts"], "protected": inventory["protected"],
                    "book_links": inventory["book_links"], "cache": inventory["cache"],
                    "verified_by_genre": inventory["verified_by_genre"],
                    "sha256": sha256(args.output.read_bytes()).hexdigest()}
        data = args.apply.read_bytes()
        if sha256(data).hexdigest() != args.approved_sha256:
            raise ValueError("The approved manifest checksum is required")
        manifest = json.loads(data)
        if manifest["format"] != 2 or manifest["scope"] != args.scope:
            raise ValueError("Manifest format or scope differs")
        counts = Counter()
        for i in range(0, len(manifest["rows"]), args.batch_size):
            with connection, connection.cursor() as cur:
                identity = database_identity(cur)
                if not identity["cluster"] or identity != manifest["identity"]:
                    raise ValueError("Manifest belongs to another database")
                counts.update(apply_chunk(cur, args.scope, manifest["rows"][i:i+args.batch_size]))
        return dict(counts)
    finally:
        connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scope", choices=("catalog","ai"))
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--output", type=Path, help="Create a read-only impact manifest")
    group.add_argument("--apply", type=Path, help="Apply a reviewed manifest")
    parser.add_argument("--approved-sha256")
    parser.add_argument("--batch-size", type=int, choices=range(1,101), default=20, metavar="1..100")
    args = parser.parse_args()
    import logging
    logging.basicConfig(level=logging.INFO)
    logging.info("%s", json.dumps(main(args), ensure_ascii=False))
