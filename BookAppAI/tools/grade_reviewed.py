"""Grade the fixed questions using independently reviewed ISBN matches for each question."""

import argparse
import asyncio
from hashlib import sha256
import json
from pathlib import Path
from sqlalchemy import text
from app import database
from app.services.reviewed_release import fingerprint
from tools.evaluate_reviewed import BURNOUT, QUESTIONS


def grade(run, judgments):
    questions = json.loads(QUESTIONS.read_text())
    if [r["query"] for r in run] != [q["query"] for q in questions] + [BURNOUT]:
        raise ValueError("Expected the fixed questions and the separate burnout case")
    run_ids = {r["run_id"] for r in run}
    releases = {r["release"] for r in run}
    if len(run_ids) != 1 or len(releases) != 1:
        raise ValueError("Mixed runs or corpus versions")
    if set(judgments) != {q["query"] for q in questions if not q["expect_empty"]}:
        raise ValueError("Review all eighteen questions individually")
    first = any_match = controls = 0
    for question, result in zip(questions, run):
        candidates = [book["isbn"] for book in result["books"]]
        if question["expect_empty"]:
            controls += int(not candidates and result["outcome"]["status"] == "NO_MATCH")
        else:
            accepted = set(judgments[question["query"]])
            if not accepted.issubset(candidates):
                raise ValueError("Grade only the returned editions")
            first += int(bool(candidates) and candidates[0] in accepted)
            any_match += int(bool(accepted))
    return dict(run=run_ids.pop(), release=releases.pop(), first=first, any=any_match, controls=controls)


async def main(args):
    data = args.run.read_bytes()
    rows = [json.loads(line) for line in data.splitlines()]
    result = grade(rows, json.loads(args.judgments.read_text()))
    if args.record:
        database.init_db()
        try:
            async with database.async_session() as db, db.begin():
                release, count = await fingerprint(db)
                if release != result["release"] or count < 30:
                    raise ValueError("Evaluated data or model versions have changed")
                await db.execute(text("""
                    INSERT INTO corpus_quality_runs (run_id,release,evidence_digest,first_match,any_match,controls)
                    VALUES (:run,:release,:digest,:first,:any,:controls)
                """), dict(result, digest=sha256(data).hexdigest()))
        finally:
            await database.engine.dispose()
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("judgments", type=Path)
    parser.add_argument("--record", action="store_true", help="Register the reviewed result in the selected database")
    asyncio.run(main(parser.parse_args()))
