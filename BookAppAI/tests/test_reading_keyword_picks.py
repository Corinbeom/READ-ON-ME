from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.schemas import ReadingKeywordPicksRequest
from app.services.reading_keyword_picks import find_reading_keyword_isbns


@pytest.mark.asyncio
async def test_public_picks_drop_legacy_workbooks_and_return_distinct_normalized_isbns():
    rows = [
        {"isbn": "9788936434120", "title": "수능문학 기출문제집"},
        {"isbn": "9788998441012", "title": "모순"},
        {"isbn": "8998441012", "title": "모순"},
        {"isbn": "9788932917245", "title": "어린 왕자"},
    ]
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(mappings=lambda: rows)

    assert await find_reading_keyword_isbns(db, [" 소설  ", "USER_ADDED", "Fiction", "fiction"]) == [
        "9788998441012", "9788932917245",
    ]
    assert db.execute.await_args.args[1] == {"keywords": ["fiction", "소설"]}


@pytest.mark.parametrize("tags", [[], ["a", "b", "c", "d"], [" "], ["가족\x00"]])
def test_public_pick_input_is_bounded(tags):
    with pytest.raises(ValidationError):
        ReadingKeywordPicksRequest(keywords=tags)
