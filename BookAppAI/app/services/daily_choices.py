"""Rotate three different ways into the reviewed catalog, once per Korean calendar day."""
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256

from app.services.keyword_language import korean_keyword
from app.services.reading_keyword_picks import BROAD_LABELS
from app.services.text_utils import MULTI_BOOK_SET_TITLE, contains_exclusion_terms

KST = timezone(timedelta(hours=9))
QUESTIONS = {
    "STORY": "{topic}에 관심이 있어. 이 주제로 몰입해서 읽을 이야기를 추천해줘.",
    "NONFICTION": "{topic}에 대해 더 알고 싶어. 어떤 책부터 읽어볼까?",
    "PRACTICAL": "{topic}에 관심이 있어. 생활에서 직접 해볼 수 있는 책을 추천해줘.",
}


def choice_topic(classification, title):
    primary = classification.get("primary_keyword")
    tags = classification.get("tags") or []
    # Story classifications often name the format; lead with what the story explores.
    values = [*tags, primary] if classification.get("book_type") == "STORY" else [primary, *tags]
    labels = [label for value in values if (label := korean_keyword(value))]
    specific = [label for label in labels if label not in BROAD_LABELS]
    for label in specific:
        if label in title:
            return label
    return next(iter(specific or labels), None)


def daily_choices(books, day: date):
    pools = {kind: [] for kind in QUESTIONS}
    for isbn, (fields, classification) in books.items():
        kind = classification.get("book_type")
        title = fields["title"]
        if kind not in pools or contains_exclusion_terms(title) or MULTI_BOOK_SET_TITLE.search(title):
            continue
        topic = choice_topic(classification, title)
        if topic:
            pools[kind].append({"isbn": isbn, "title": title, "authors": fields["authors"],
                                "contents": fields["contents"], "topic": topic,
                                "prompt": QUESTIONS[kind].format(topic=topic)})

    selected = []
    for pool in pools.values():
        if not pool:
            continue
        # A stable cycle avoids both insertion-order bias and random repeats on consecutive days.
        pool.sort(key=lambda book: sha256(book["isbn"].encode()).digest())
        offset = day.toordinal() % len(pool)
        pool[:] = pool[offset:] + pool[:offset]

    def pick(pool):
        titles = {book["title"] for book in selected}
        topics = {book["topic"] for book in selected}
        available = [book for book in pool if book["title"] not in titles]
        if available:
            selected.append(next((b for b in available if b["topic"] not in topics), available[0]))

    for pool in pools.values():
        pick(pool)
    remaining = [book for pool in pools.values() for book in pool]
    for _ in range(3 - len(selected)):
        pick(remaining)
    return selected


def korean_today():
    return datetime.now(KST).date()
