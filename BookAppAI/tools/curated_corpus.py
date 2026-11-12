"""Prepare a reviewable ISBN manifest, then queue explicitly selected books."""

import argparse
import asyncio
import json
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app import database
from app.models.book_corpus import BookCorpus
from app.models.corpus_ingestion_job import CorpusIngestionJob
from app.services import book_ai_service, corpus_ingestion, curated_corpus


def _write(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


async def discover(args) -> None:
    if args.isbn_file:
        source = json.loads(args.isbn_file.read_text())
        candidates = source.get("candidates") if isinstance(source, dict) else source
        if not isinstance(candidates, list):
            raise ValueError("ISBN file must contain a candidate list")
    elif args.library_keyword:
        candidates = await curated_corpus.discover_naru_books(
            keyword=args.library_keyword, pages=args.pages,
        )
    else:
        if not args.kdc or not args.start_date or not args.end_date:
            raise ValueError("Library discovery requires --kdc, --start-date, and --end-date")
        candidates = await curated_corpus.discover_naru_popular(
            kdc=args.kdc, start_date=date.fromisoformat(args.start_date),
            end_date=date.fromisoformat(args.end_date), pages=args.pages,
        )
    if not candidates:
        raise ValueError("No candidates found")

    database.init_db()
    records = []
    try:
        async with database.async_session() as db:
            all_isbns = [curated_corpus._clean_candidate(item) for item in candidates]
            valid_isbns = [item["isbn"] for item in all_isbns if item]
            existing = set((await db.execute(select(BookCorpus.isbn).where(
                BookCorpus.isbn.in_(valid_isbns)
            ))).scalars().all())
        seen = set()
        for raw in candidates:
            candidate = curated_corpus._clean_candidate(raw)
            if not candidate or candidate["isbn"] in seen:
                continue
            seen.add(candidate["isbn"])
            if candidate["isbn"] in existing:
                records.append({"candidate": candidate, "status": "ALREADY_INDEXED"})
            elif sum(record.get("status") != "ALREADY_INDEXED" for record in records) < args.limit:
                try:
                    records.append(await curated_corpus.verify_candidate(candidate))
                except Exception as exc:
                    records.append({"candidate": candidate, "status": "ERROR", "reason": type(exc).__name__})
            else:
                break
            _write(args.output, {"generated_at": datetime.now(timezone.utc).isoformat(), "records": records})
            await asyncio.sleep(args.delay)
    finally:
        if database.engine is not None:
            await database.engine.dispose()
    print(f"reviewed={len(records)} ready={sum(r['status'] == 'READY_FOR_REVIEW' for r in records)} output={args.output}")


async def queue(args) -> None:
    manifest = json.loads(args.manifest.read_text())
    records = {row["candidate"]["isbn"]: row for row in manifest["records"]}
    selected = list(dict.fromkeys(isbn.strip() for isbn in args.isbns.split(",")))
    naru_selected = set(isbn.strip() for isbn in args.naru_isbns.split(",") if isbn.strip())
    if not 1 <= len(selected) <= 20 or any(
        isbn not in records or records[isbn]["status"] != "READY_FOR_REVIEW" for isbn in selected
    ):
        raise ValueError("Select 1–20 ready ISBNs from the manifest")
    if not naru_selected.issubset(selected):
        raise ValueError("--naru-isbns must be selected ISBNs")
    if not args.apply:
        for isbn in selected:
            row = records[isbn]
            print(f"PREVIEW isbn={isbn} title={row['book']['title']} source={row['candidate']['discovery_source']} description={'DATA4LIBRARY' if isbn in naru_selected else 'AUTO'}")
        return

    database.init_db()
    try:
        async with database.async_session() as db:
            for isbn in selected:
                candidate = dict(records[isbn]["candidate"])
                if isbn in naru_selected:
                    candidate["preferred_description_source"] = "DATA4LIBRARY"
                # Re-read the real source; a local manifest is a review aid, not trusted book text.
                verified = await curated_corpus.verify_candidate(candidate)
                if verified["status"] != "READY_FOR_REVIEW":
                    print(f"SKIP isbn={isbn} reason={verified.get('reason', verified['status'])}")
                    continue
                status, job = await corpus_ingestion.enqueue_book(
                    db, verified["book"], source="CURATED_SEED",
                    provenance=verified["candidate"],
                )
                print(f"{status} isbn={isbn} job_id={job.id if job else '-'}")
                await asyncio.sleep(args.delay)
    finally:
        if database.engine is not None:
            await database.engine.dispose()


async def review(args) -> None:
    if args.apply and not args.decision:
        raise ValueError("--apply requires --decision")
    database.init_db()
    embedding_started = False
    try:
        async with database.async_session() as db:
            job = await db.get(CorpusIngestionJob, args.job_id)
            if not job or job.source != "CURATED_SEED":
                raise ValueError("Curated job not found")
            book = job.payload.get("book") or {}
            provenance = job.payload.get("provenance") or {}
            print(json.dumps({
                "job_id": job.id, "status": job.status, "isbn": job.isbn,
                "title": book.get("title"), "authors": book.get("authors"),
                "contents": book.get("contents"), "provenance": provenance,
                "classification": job.progress,
            }, ensure_ascii=False, indent=2))
            if not args.apply:
                return
            if args.decision == "approve":
                await book_ai_service.init_embedding_model()
                embedding_started = True
            status = await corpus_ingestion.review_curated_job(
                db, args.job_id, decision=args.decision, keyword=args.keyword,
                tags=args.tags.split(",") if args.tags is not None else None,
                note=args.note,
            )
            print(f"review_result={status} job_id={args.job_id}")
    finally:
        if database.engine is not None:
            await database.engine.dispose()
        if embedding_started:
            book_ai_service.shutdown_embedding_model()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    discovery = sub.add_parser("discover", help="Verify library or externally curated ISBN candidates")
    origin = discovery.add_mutually_exclusive_group(required=True)
    origin.add_argument("--isbn-file", type=Path)
    origin.add_argument("--kdc", help="Library KDC subject code")
    origin.add_argument("--library-keyword", help="Library text search, used for discovery only")
    discovery.add_argument("--start-date", help="YYYY-MM-DD")
    discovery.add_argument("--end-date", help="YYYY-MM-DD")
    discovery.add_argument("--pages", type=int, nargs="+", default=[1, 3, 5])
    discovery.add_argument("--limit", type=int, default=20)
    discovery.add_argument("--delay", type=float, default=1.0)
    discovery.add_argument("--output", type=Path, default=Path("/tmp/readonme-curated-candidates.json"))
    intake = sub.add_parser("queue", help="Queue only selected ISBNs after reading the manifest")
    intake.add_argument("--manifest", type=Path, required=True)
    intake.add_argument("--isbns", required=True, help="Comma-separated exact ISBNs from the manifest")
    intake.add_argument("--naru-isbns", default="", help="Selected ISBNs whose verified library synopsis should replace Kakao text")
    intake.add_argument("--apply", action="store_true")
    intake.add_argument("--delay", type=float, default=6.0)
    decision = sub.add_parser("review", help="Inspect a classified curated job before publishing")
    decision.add_argument("--job-id", required=True)
    decision.add_argument("--decision", choices=["approve", "hold"])
    decision.add_argument("--keyword", help="Reviewed replacement keyword")
    decision.add_argument("--tags", help="Comma-separated reviewed replacement tags")
    decision.add_argument("--note", help="Reason for a hold or classification override")
    decision.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if hasattr(args, "limit") and (not 1 <= args.limit <= 20 or args.delay < 0):
        parser.error("limit must be 1–20 and delay nonnegative")
    if args.command == "queue" and args.delay < 0:
        parser.error("delay must be nonnegative")
    asyncio.run({"discover": discover, "queue": queue, "review": review}[args.command](args))
