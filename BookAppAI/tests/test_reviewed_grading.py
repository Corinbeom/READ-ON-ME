import json

import pytest
from tools.evaluate_reviewed import BURNOUT, QUESTIONS
from tools.grade_reviewed import grade


def test_unrelated_grades_and_degraded_empty_cannot_pass():
    questions = json.loads(QUESTIONS.read_text())
    rows = [dict(q, run_id="fixture", release="hash", outcome={"status": "MODEL"},
                 books=[{"isbn": "unrelated"}, {"isbn": "accepted"}]) for q in questions]
    judgments = {q["query"]: ["accepted"] for q in questions if not q["expect_empty"]}
    rows[-2].update(books=[], outcome={"status": "NO_MATCH"})
    rows[-1].update(books=[], outcome={"status": "DEGRADED_EMPTY"})
    rows.append(dict(query=BURNOUT, run_id="fixture", release="hash"))
    result = grade(rows, judgments)
    assert (result["first"], result["any"], result["controls"]) == (0, 18, 1)
    judgments[rows[0]["query"]] = ["missing"]
    with pytest.raises(ValueError, match="returned editions"):
        grade(rows, judgments)
