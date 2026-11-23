"""Reading keywords from the same current, permitted books as Galpi search."""

from collections import defaultdict

from app.services.text_utils import MULTI_BOOK_SET_TITLE, contains_exclusion_terms


def tags_for(classification):
    tags = classification.get("tags", [])
    if not isinstance(tags, list):
        return set()
    return {tag.strip() for tag in tags if isinstance(tag, str) and tag.strip()
            and tag.strip().casefold() != "user_added"}


def library_keywords(books, isbns, limit):
    evidence = defaultdict(list)
    analyzed = 0
    for isbn in sorted(set(isbns).intersection(books)):
        _, classification = books[isbn]
        tags = tags_for(classification)
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
    wanted = {tag.strip().casefold() for tag in keywords}
    ranked = []
    for isbn, (fields, classification) in books.items():
        matches = wanted.intersection(tag.casefold() for tag in tags_for(classification))
        title = fields["title"]
        if matches and not contains_exclusion_terms(title) and not MULTI_BOOK_SET_TITLE.search(title):
            ranked.append((-len(matches), isbn))
    return [{"isbn13": isbn, "title": books[isbn][0]["title"], "authors": books[isbn][0]["authors"],
             "thumbnail": None} for _, isbn in sorted(ranked)[:3]]
