"""Install the bundled, reviewed pilot in an explicitly selected database."""

import asyncio
from datetime import date
import json
from pathlib import Path

from sqlalchemy import text

from app import database
from app.corpus_policy import EMBEDDING_USES
from app.services.reviewed_corpus import record_field

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "evaluation/reviewed/seed.json"
CHECKED = date(2026, 11, 20)
VERSION = "2026-11-20"
SOURCES = {
    "HARVARD_LIBRARY": "https://library.harvard.edu/services-tools/harvard-library-datasets",
    "WIKIDATA": "https://www.wikidata.org/wiki/Wikidata:Licensing",
    "READ_ON_ME_EDITORIAL": "repo:BookAppAI/evaluation/reviewed/seed.json",
}


async def seed(db, path=SEED):
    for provider, ref in SOURCES.items():
        await db.execute(text("""
            INSERT INTO corpus_use_policy (provider,version,evidence_ref,checked_on,uses,active)
            VALUES (:provider,:version,:ref,:day,:uses,true) ON CONFLICT DO NOTHING
        """), {"provider": provider, "version": VERSION, "ref": ref, "day": CHECKED, "uses": sorted(EMBEDDING_USES)})
    catalog = json.loads(path.read_text())
    for book in catalog:
        checked = date.fromisoformat(book["checked_on"]) if "checked_on" in book else CHECKED
        for field in ("title", "authors", "contents"):
            provider = "READ_ON_ME_EDITORIAL" if field == "contents" else book.get("provider", "WIKIDATA")
            ref = f"repo:BookAppAI/evaluation/reviewed/{path.name}#{book['isbn']}" if field == "contents" else book["source_ref"]
            await record_field(db, book["isbn"], field, book[field], provider, VERSION, ref, checked)


async def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    batch = parser.add_mutually_exclusive_group()
    batch.add_argument("--supplement", action="store_const", const="supplement.json", dest="batch")
    batch.add_argument("--discovery", action="store_const", const="discovery.json", dest="batch")
    batch.add_argument("--loss-startup", action="store_const", const="loss-startup.json", dest="batch")
    batch.add_argument("--reader-expansion", action="store_const", const="reader-expansion.json", dest="batch")
    args = parser.parse_args()
    database.init_db()
    try:
        async with database.async_session() as db, db.begin():
            await seed(db, SEED.with_name(args.batch or SEED.name))
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
