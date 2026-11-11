from app.services.corpus_quality import normalize_isbn, preflight_candidate, validate_classification


def _book(**overrides):
    return {
        "isbn": "9780000000002", "title": "어두운 이야기", "authors": "작가",
        "contents": "한 사람이 낯선 집에서 진실을 찾아가는 어두운 분위기의 소설입니다.",
        **overrides,
    }


def test_isbn_normalization_and_preflight_rejects_noise():
    assert normalize_isbn("0000000000 9780000000002") == "9780000000002"
    assert normalize_isbn("0000000000") == "9780000000002"
    assert normalize_isbn("9780000000000") is None
    assert normalize_isbn("9771228648008") is None  # ISSN-based magazine barcode, not a book ISBN
    assert preflight_candidate(_book(isbn="9771228648008")) == ("REJECTED", "PERIODICAL")
    assert preflight_candidate(_book(isbn="1400000274965")) == ("REJECTED", "INVALID_ISBN")
    assert preflight_candidate(_book(title="수능문학 문제집")) == ("REJECTED", "EDUCATIONAL_MATERIAL")
    assert preflight_candidate(_book(title="문학 시리즈 세트(전3권)")) == ("REJECTED", "MULTI_BOOK_SET")
    assert preflight_candidate(_book(title="멋진 신세계", contents="과학이 발달한 사회의 미래를 그린 소설로 평가받는 작품입니다.")) is None
    assert preflight_candidate(_book(contents="짧은 소개")) == ("HOLD", "SHORT_DESCRIPTION")
    assert preflight_candidate(_book()) is None


def test_classification_requires_grounded_evidence_and_does_not_copy_discovery_keyword():
    book = _book()
    evidence = "낯선 집에서 진실을 찾아가는 어두운 분위기의 소설"
    result = {"book_type": "STORY", "primary_keyword": "스릴러", "tags": ["소설", "스릴러"], "evidence_quote": evidence}
    assert validate_classification(book, result) == ("ACTIVE", None, "스릴러", ["스릴러", "소설"])
    assert validate_classification(book, {**result, "evidence_quote": "없는 줄거리와 가짜 근거를 제시합니다"})[:2] == ("HOLD", "UNVERIFIED_EVIDENCE")
    assert validate_classification(book, {**result, "book_type": "EDUCATIONAL"})[:2] == ("REJECTED", "EDUCATIONAL")
