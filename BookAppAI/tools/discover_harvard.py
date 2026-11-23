"""Discover Korean print books from Harvard's open Alma bibliographic records.

Write a field manifest for inspection and tools.reviewed_corpus import. Only
structured bibliographic fields are used, excluding jacket copy and images.
"""

import argparse
import asyncio
from datetime import date
import json
from pathlib import Path
import re
import unicodedata

import httpx

from app.services.corpus_quality import normalize_isbn
from tools.seed_reviewed import VERSION

API = "https://api.lib.harvard.edu/v2/items.json"


def items(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def strings(value):
    for item in items(value):
        if isinstance(item, dict):
            item = item.get("#text")
        if isinstance(item, str) and item.strip():
            yield unicodedata.normalize("NFC", item.strip())


def korean(values):
    return next((s.rstrip(" /:=") for s in values if re.search("[가-힣]", s)), None)


def edition_isbn(value):
    token = value.partition(" ")[0].replace("-", "")
    if re.fullmatch(r"(?:[0-9]{13}|[0-9]{9}[0-9Xx])", token):
        return normalize_isbn(token)
    return None


def fields_from_record(record, checked_on):
    info = record.get("recordInfo", {}).get("recordIdentifier", {})
    ref = info.get("#text", "") if isinstance(info, dict) else ""
    if not ref.isdigit() or info.get("@source") != "MH:ALMA":
        return []
    if list(strings(record.get("typeOfResource"))) != ["text"]:
        return []
    forms = {form for desc in items(record.get("physicalDescription")) for form in strings(desc.get("form"))}
    if "print" not in forms:
        return []
    languages = {code for lang in items(record.get("language"))
                 for term in items(lang.get("languageTerm")) if isinstance(term, dict) and term.get("@type") == "code"
                 for code in strings(term)}
    if languages != {"kor"}:
        return []
    ident = {edition_isbn(value) for entry in items(record.get("identifier"))
             if isinstance(entry, dict) and entry.get("@type") == "isbn" and entry.get("@invalid") != "yes"
             for value in strings(entry)}
    ident.discard(None)
    if len(ident) != 1:
        return []
    isbn = ident.pop()
    title = korean(value for entry in items(record.get("titleInfo")) if not entry.get("@type")
                   for value in strings(entry.get("title")))
    authors = []
    for entry in items(record.get("name")):
        if entry.get("@type") != "personal":
            continue
        roles = {v.lower().rstrip(".") for role in items(entry.get("role"))
                 for v in strings(role.get("roleTerm"))}
        if not roles.intersection({"aut", "author", "creator"}):
            continue
        author = korean(value for part in items(entry.get("namePart")) if isinstance(part, str)
                        for value in strings(part))
        if author:
            author = author.rstrip(" ,")
        if author and author not in authors:
            authors.append(author)
    headings = []
    for subject in items(record.get("subject")):
        if not isinstance(subject, dict) or subject.get("@authority") != "lcsh":
            continue
        terms = [term for field in ("topic", "geographic", "temporal", "genre")
                 for term in strings(subject.get(field))]
        if subject.get("topic") and terms:
            headings.append(" — ".join(terms))
    if not (title and authors and headings):
        return []
    source = f"https://id.lib.harvard.edu/alma/{ref}/catalog"
    values = {"title": title, "authors": ", ".join(authors),
              "contents": "하버드 도서관 서지 주제: " + "; ".join(dict.fromkeys(headings))}
    return [dict(isbn=isbn, field=k, value=v, provider="HARVARD_LIBRARY", policy_version=VERSION,
                 source_ref=source, checked_on=checked_on.isoformat()) for k, v in values.items()]


async def discover(subjects, pages):
    books = {}
    checked = date.today()
    async with httpx.AsyncClient(timeout=25, headers={"User-Agent": "ReadOnMe-catalog/1.0"}) as client:
        for subject in subjects:
            for page in range(pages):
                res = await client.get(API, params={"subject": subject, "languageCode": "kor",
                                                     "start": page * 100, "limit": 100})
                res.raise_for_status()
                payload = res.json()
                records = items((payload.get("items") or {}).get("mods"))
                for record in records:
                    fields = fields_from_record(record, checked)
                    if fields:
                        books.setdefault(fields[0]["isbn"], fields)
                if (page + 1) * 100 >= int(payload["pagination"]["numFound"]):
                    break
    return [field for isbn in sorted(books) for field in books[isbn]]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subject", action="append", required=True)
    parser.add_argument("--pages", type=int, default=1)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.pages < 1:
        parser.error("--pages must be positive")
    result = asyncio.run(discover(args.subject, args.pages))
    with args.output.open("x") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"{len(result) // 3} ISBNs")
