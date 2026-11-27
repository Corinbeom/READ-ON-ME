"""Rank displayable editions from the reviewed release using existing shelf evidence."""
from collections import Counter, defaultdict
from math import log1p

from app.services.reading_keyword_picks import BROAD_LABELS, korean_tags
from app.services.text_utils import MULTI_BOOK_SET_TITLE, contains_exclusion_terms

COMPARABLE_TYPES = {"NONFICTION", "PRACTICAL", "STORY"}


def home_picks(books, keywords, owned, peers, limit=10):
    weights = {item["tag"]: item["count"] for item in keywords}
    seed_types = defaultdict(set)
    for item in keywords:
        for isbn in item["book_isbns"]:
            if isbn in books:
                kind = books[isbn][1].get("book_type")
                if kind in COMPARABLE_TYPES:
                    seed_types[item["tag"]].add(kind)

    matches = {}
    frequency = Counter()
    peer_order = {isbn: pos for pos, isbn in enumerate(peers)}
    for isbn, (fields, classification) in books.items():
        title = fields["title"]
        if (isbn in owned or classification.get("book_type") in {"COLLECTION", "EDUCATIONAL"}
                or contains_exclusion_terms(title) or MULTI_BOOK_SET_TITLE.search(title)):
            continue
        shared = weights.keys() & korean_tags(classification.get("tags"))
        if shared or isbn in peer_order:
            matches[isbn] = shared
            frequency.update(shared)

    def specific_matches(isbn):
        return [tag for tag in matches[isbn] if tag.replace(" ", "") not in BROAD_LABELS]

    def ranking(isbn):
        score = sum(weights[tag] * log1p(len(books) / frequency[tag]) for tag in sorted(matches[isbn]))
        return not specific_matches(isbn), -score, peer_order.get(isbn, len(peers)), isbn

    def crosses_type(isbn):
        kind = books[isbn][1].get("book_type")
        return kind in COMPARABLE_TYPES and any(
            seed_types[tag] and kind not in seed_types[tag] for tag in specific_matches(isbn)
        )

    ranked = sorted(matches, key=ranking)
    selected = []
    bridge = False
    while ranked and len(selected) < limit:
        isbn = ranked[0]
        if len(selected) in (1, 3):
            isbn = next((candidate for candidate in ranked if crosses_type(candidate)), isbn)
        bridge |= crosses_type(isbn)
        selected.append(isbn)
        ranked.remove(isbn)
        # A shelf edition outside the release can still anchor a comparison between its picks.
        kind = books[isbn][1].get("book_type")
        if kind in COMPARABLE_TYPES:
            for tag in matches[isbn]:
                if not seed_types[tag]:
                    seed_types[tag].add(kind)

    interest = any(matches[isbn] for isbn in selected)
    peers_only = any(not matches[isbn] for isbn in selected)
    if interest and peers_only:
        basis = "INTEREST_AND_READERS"
    elif interest:
        basis = "DISCOVERY" if bridge else "INTEREST"
    else:
        basis = "READERS" if peers_only else "EMPTY"
    return {"basis": basis, "books": [
        {"isbn13": isbn, "title": books[isbn][0]["title"], "authors": books[isbn][0]["authors"], "thumbnail": None}
        for isbn in selected
    ]}
