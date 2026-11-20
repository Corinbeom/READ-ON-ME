"""Run the fixed reopening questions, preserving evidence for human grading."""

import argparse
import asyncio
import json
from pathlib import Path

from uuid import uuid4
from app.services.reviewed_release import fingerprint
from app import database
from app.services.reviewed_corpus import search_reviewed

QUESTIONS = Path(__file__).resolve().parents[1] / "evaluation/reviewed/questions.json"
BURNOUT = "번아웃 올 때 읽을 만한 책"


async def run(output):
    questions = json.loads(QUESTIONS.read_text())
    questions.append({"query": BURNOUT, "rubric": "추천 이유와 상세 소개가 선택에 도움이 되는지 별도 검토"})
    database.init_db()
    try:
        async with database.async_session() as db:
            release, count = await fingerprint(db)
        if count < 30:
            raise RuntimeError("At least 30 indexed books required")
        run_id = str(uuid4())
        with output.open("x") as log:
            for case in questions:
                async with database.async_session() as db, db.begin():
                    if await fingerprint(db) != (release, count):
                        raise RuntimeError("Corpus changed during evaluation")
                    outcome = {}
                    books = await search_reviewed(db, case["query"], outcome)
                    record = dict(case, run_id=run_id, release=release, outcome=outcome, books=books)
                    log.write(json.dumps(record, ensure_ascii=False) + "\n")
                    log.flush()
    finally:
        await database.engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    asyncio.run(run(parser.parse_args().output))
