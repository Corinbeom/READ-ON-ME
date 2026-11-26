"""Import reviewed fields or exercise the reviewed corpus while Galpi is closed."""

import argparse
import asyncio
from collections import defaultdict
from datetime import date
import json
import logging
from pathlib import Path

from sqlalchemy import text

from app import database
from app.services.reviewed_corpus import index_reviewed, rank_reviewed, record_field, search_reviewed


async def import_manifest(entries, new_only):
    grouped = defaultdict(list)
    for entry in entries:
        grouped[entry["isbn"]].append(entry)
    async with database.async_session() as db, db.begin():
        for isbn, fields in sorted(grouped.items()):
            if new_only:
                await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:isbn, 0))"), {"isbn": isbn})
                exists = await db.scalar(text("SELECT EXISTS (SELECT 1 FROM corpus_field_versions WHERE isbn=:isbn)"),
                                         {"isbn": isbn})
                if exists:
                    continue
            for entry in fields:
                await record_field(db, checked_on=date.fromisoformat(entry["checked_on"]),
                                   **{key: entry[key] for key in (
                                       "isbn", "field", "value", "provider", "policy_version", "source_ref")})


async def run(args):
    database.init_db()
    try:
        if args.command == "import":
            await import_manifest(json.loads(args.manifest.read_text()), args.new_only)
        elif args.command == "index":
            for isbn in sorted(set(args.isbn)):
                async with database.async_session() as db, db.begin():
                    await index_reviewed(db, isbn)
        else:
            async with database.async_session() as db, db.begin():
                books = await (search_reviewed(db, args.query) if args.command == "search" else rank_reviewed(db, args.query, args.isbn))
                args.output.write_text(json.dumps(books, ensure_ascii=False, indent=2))
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    ingest = commands.add_parser("import")
    ingest.add_argument("manifest", type=Path)
    ingest.add_argument("--new-only", action="store_true", help="Skip ISBNs that already have any field history")
    commands.add_parser("index").add_argument("isbn", nargs="+")
    search = commands.add_parser("search")
    search.add_argument("query")
    search.add_argument("--output", required=True, type=Path)
    rank = commands.add_parser("rank")
    rank.add_argument("query")
    rank.add_argument("isbn", nargs="+")
    rank.add_argument("--output", required=True, type=Path)
    logging.basicConfig(level=logging.INFO)
    # HTTPX logs complete request URLs, including provider keys in query parameters.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    asyncio.run(run(parser.parse_args()))
