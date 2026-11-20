"""Import reviewed fields or exercise the reviewed corpus while Galpi is closed."""

import argparse
import asyncio
from datetime import date
import json
import logging
from pathlib import Path

from app import database
from app.services.reviewed_corpus import index_reviewed, rank_reviewed, record_field, search_reviewed


async def run(args):
    database.init_db()
    try:
        async with database.async_session() as db, db.begin():
            if args.command == "import":
                entries = json.loads(args.manifest.read_text())
                for entry in entries:
                    await record_field(db, checked_on=date.fromisoformat(entry["checked_on"]),
                                       **{key: entry[key] for key in (
                                           "isbn", "field", "value", "provider", "policy_version", "source_ref")})
                logging.info("Recorded %d field observations", len(entries))
            elif args.command == "index":
                for isbn in sorted(set(args.isbn)):
                    await index_reviewed(db, isbn)
            else:
                books = await (search_reviewed(db, args.query) if args.command == "search" else rank_reviewed(db, args.query, args.isbn))
                args.output.write_text(json.dumps(books, ensure_ascii=False, indent=2))
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("import").add_argument("manifest", type=Path)
    commands.add_parser("index").add_argument("isbn", nargs="+")
    search = commands.add_parser("search")
    search.add_argument("query")
    search.add_argument("--output", required=True, type=Path)
    rank = commands.add_parser("rank")
    rank.add_argument("query")
    rank.add_argument("isbn", nargs="+")
    rank.add_argument("--output", required=True, type=Path)
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run(parser.parse_args()))
