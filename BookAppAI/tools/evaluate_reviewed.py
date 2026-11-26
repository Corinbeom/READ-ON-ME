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


async def run(output, *, reader_scenarios=False, questions_path=None):
    if questions_path is not None:
        questions = json.loads(questions_path.read_text())
        if not isinstance(questions, list) or not questions or not all(
            isinstance(case, dict) and isinstance(case.get("query"), str) and case["query"].strip()
            for case in questions
        ):
            raise ValueError(f"{questions_path} must contain a nonempty list of questions with query text")
    elif reader_scenarios:
        questions = json.loads(QUESTIONS.with_name("reader-scenarios.json").read_text())
    else:
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
    cases = parser.add_mutually_exclusive_group()
    cases.add_argument("--reader-scenarios", action="store_true", help="Evaluate the diverse reader questions")
    cases.add_argument("--questions", type=Path, help="Evaluate a batch's JSON list of reader questions")
    args = parser.parse_args()
    asyncio.run(run(args.output, reader_scenarios=args.reader_scenarios, questions_path=args.questions))
