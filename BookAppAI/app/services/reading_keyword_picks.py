"""Aggregate canonical keywords with one vote per ISBN."""

from collections import defaultdict

from app.services.keyword_language import korean_keyword
from app.services.text_utils import MULTI_BOOK_SET_TITLE, contains_exclusion_terms


def korean_tags(tags):
    if not isinstance(tags, list):
        return set()
    return {label for tag in tags if (label := korean_keyword(tag))}


def library_keywords(tags_by_isbn, isbns, limit):
    evidence = defaultdict(list)
    analyzed = 0
    for isbn in sorted(set(isbns).intersection(tags_by_isbn)):
        tags = korean_tags(tags_by_isbn[isbn])
        if tags:
            analyzed += 1
        for tag in tags:
            evidence[tag].append(isbn)
    ranked = sorted(evidence, key=lambda tag: (-len(evidence[tag]), tag))
    return {"analyzed": analyzed, "keywords": [
        {"tag": tag, "count": len(evidence[tag]), "book_isbns": evidence[tag]}
        for tag in ranked[:max(0, limit)]
    ]}


def public_picks(books, keywords):
    wanted = {label for tag in keywords if (label := korean_keyword(tag))}
    ranked = []
    for isbn, (fields, classification) in books.items():
        matches = wanted.intersection(korean_tags(classification.get("tags")))
        title = fields["title"]
        if matches and not contains_exclusion_terms(title) and not MULTI_BOOK_SET_TITLE.search(title):
            ranked.append((-len(matches), isbn))
    return [{"isbn13": isbn, "title": books[isbn][0]["title"], "authors": books[isbn][0]["authors"],
             "thumbnail": None} for _, isbn in sorted(ranked)[:3]]
