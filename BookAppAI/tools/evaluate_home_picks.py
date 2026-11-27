"""Compare top-three shelf suggestions against the same reviewed release, offline."""
import asyncio
from collections import Counter

from app import database
from app.services.home_picks import home_picks
from app.services.reading_keyword_picks import library_keywords, public_picks
from app.services.reviewed_release import configured_release, require_release


def compare(books):
    totals = {method: Counter() for method in ("public", "home")}
    distinct = {method: set() for method in totals}
    tags = {isbn: data.get("tags", []) for isbn, (_, data) in books.items()}
    for isbn, (fields, source) in books.items():
        evidence = library_keywords(tags, [isbn], 3)["keywords"]
        others = {key: value for key, value in books.items() if key != isbn}
        before = public_picks(others, [item["tag"] for item in evidence])
        after = home_picks(books, evidence, {isbn}, [], limit=3)["books"]
        for method, picks in (("public", before), ("home", after)):
            counts = totals[method]
            counts["shelves"] += 1
            counts["with_picks"] += bool(picks)
            counts["cards"] += len(picks)
            different = 0
            for pick in picks:
                kind = books[pick["isbn13"]][1]["book_type"]
                different += kind != source["book_type"]
                distinct[method].add(pick["isbn13"])
            counts["same_type"] += len(picks) - different
            counts["with_other_type"] += bool(different)
        if after and before != after:
            print(fields["title"], "→", " / ".join(pick["title"] for pick in after))
    for method, counts in totals.items():
        print(method, dict(counts), "distinct", len(distinct[method]))


async def main():
    database.init_db()
    try:
        async with database.async_session() as db, db.begin():
            compare(await require_release(db, configured_release()))
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
