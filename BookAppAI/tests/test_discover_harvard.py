from datetime import date

from tools.discover_harvard import fields_from_record


def test_only_single_edition_alma_metadata_is_exported():
    record = {
        "recordInfo": {"recordIdentifier": {"@source": "MH:ALMA", "#text": "123"}},
        "language": {"languageTerm": {"@type": "code", "#text": "kor"}},
        "physicalDescription": {"form": {"#text": "print"}},
        "typeOfResource": "text",
        "titleInfo": [{"title": "romanized"}, {"title": "테스트 책"}],
        "identifier": [{"@type": "isbn", "#text": "9780306406157"},
                       {"@type": "isbn", "#text": "0306406152"}],
        "name": [{"@type": "personal", "namePart": "저자,", "role": {"roleTerm": "author."}},
                 {"@type": "personal", "namePart": "번역가", "role": {"roleTerm": "translator."}}],
        "subject": {"@authority": "lcsh", "topic": "Bookstores", "genre": "Fiction"},
        "abstract": "UNREVIEWED_PUBLISHER_BLURB",
    }
    fields = fields_from_record(record, date(2026, 11, 23))
    assert [f["value"] for f in fields] == ["테스트 책", "저자", "하버드 도서관 서지 주제: Bookstores — Fiction"]
    assert all(f["isbn"] == "9780306406157" and f["provider"] == "HARVARD_LIBRARY" for f in fields)
    assert not fields_from_record({**record, "recordInfo": {}}, date.today())
    assert not fields_from_record({**record, "physicalDescription": {}}, date.today())
    record["identifier"].append({"@type": "isbn", "#text": "9788936434120"})
    assert not fields_from_record(record, date.today())
