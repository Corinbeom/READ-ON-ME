from types import SimpleNamespace

from tools.repair_legacy_isbn import _matches_snapshot, _snapshot, resolve_isbn


def _book():
    return SimpleNamespace(
        recommendation_status="LEGACY",
        isbn="1400000309490", title="플랫랜드", authors="에드윈 애보트",
        publisher="부크크", thumbnail="https://example.com/cover.png",
    )


def _document(**overrides):
    return {
        "isbn": "1127241346 1400000309490", "title": "플랫랜드",
        "authors": ["에드윈 애보트"], "publisher": "부크크",
        "thumbnail": "https://example.com/cover.png", **overrides,
    }


def test_repair_uses_valid_isbn10_from_the_same_book_record():
    assert resolve_isbn(_book(), [_document()]) == "9781127241347"


def test_repair_rejects_other_editions_and_ambiguous_matches():
    assert resolve_isbn(_book(), [_document(isbn="9791127241346")]) is None
    assert resolve_isbn(_book(), [_document(thumbnail="https://example.com/other.png")]) is None
    assert resolve_isbn(_book(), [_document(), _document(isbn="1158111118 1400000309490")]) is None


def test_repair_rechecks_every_original_field_before_updating():
    book = _book()
    original = _snapshot(book)
    assert _matches_snapshot(book, original)
    book.title = "다른 판본"
    assert not _matches_snapshot(book, original)
