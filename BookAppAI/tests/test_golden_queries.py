import json
from pathlib import Path

import pytest

from app.services.intent_classifier import IntentAnalyzer


CASES = json.loads((Path(__file__).parents[1] / "evaluation/golden_queries.json").read_text())


@pytest.mark.asyncio
@pytest.mark.parametrize("case", CASES, ids=lambda case: case["query"])
async def test_golden_query_intent(case):
    intent = await IntentAnalyzer().analyze(case["query"])
    for key, value in case.items():
        if key != "query":
            assert getattr(intent, key) == value
