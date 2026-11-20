"""Exercise the report and its approved replay on a disposable PostgreSQL transaction."""
import json
import os

import psycopg2
import pytest
from sqlalchemy.engine import make_url
from tools.transition_inventory import apply_chunk, guards, report


def test_catalog_cleanup_preserves_links_and_skips_concurrent_changes(monkeypatch):
    url = os.getenv("REVIEWED_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires a disposable PostgreSQL database")
    monkeypatch.delenv("TRANSITION_REDIS_HOST", raising=False)
    dsn = make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)
    with psycopg2.connect(dsn) as db, db.cursor() as cur:
        cur.execute("""
            CREATE TEMP TABLE books(id int, isbn13 text, average_rating float, embedded bool, title text,
                authors text, contents text, thumbnail text, publisher text, group_title text, translators text,
                publish_date date, price int, sale_price int, url text);
            CREATE TEMP TABLE popular_naru_books(id int,book_image_url text);
            CREATE TEMP TABLE ai_search_jobs(id int,result_json text);
            CREATE TEMP TABLE user_book_status(id int,book_id int,user_id int,status text);
            CREATE TEMP TABLE book_review(id int,book_id int,user_id int,rating int,comment text);
            CREATE TEMP TABLE review_like(id int,review_id int,user_id int);
            CREATE TEMP TABLE recommendation_feedback(id int,job_id int,books jsonb,rating int);
            INSERT INTO books(id,isbn13,title) VALUES (1,'A','sensitive fixture'),(2,'B','second');
            INSERT INTO user_book_status VALUES (1,1,1,'READING');
            INSERT INTO book_review VALUES (1,1,1,5,'private comment');
            INSERT INTO review_like VALUES (1,1,1);
            INSERT INTO recommendation_feedback VALUES(1,1,'[{"isbn":"A","title":"sensitive fixture"}]',5);
            INSERT INTO popular_naru_books VALUES(1,'sensitive fixture');
            INSERT INTO ai_search_jobs VALUES(1,'sensitive fixture');
        """)
        manifest = report(cur, "catalog")
        assert "sensitive fixture" not in json.dumps(manifest)
        assert "private comment" not in json.dumps(manifest)
        assert manifest["book_links"]["shelf_and_review"] == 1
        cur.execute("UPDATE books SET title='after audit' WHERE id=2")
        assert apply_chunk(cur, "catalog", manifest["rows"]) == {"applied": 4, "skipped_changed": 1}
        assert apply_chunk(cur, "catalog", manifest["rows"]) == {"already_applied": 4, "skipped_changed": 1}
        assert guards(cur, "catalog") == manifest["protected"]
        cur.execute("SELECT books FROM recommendation_feedback")
        assert cur.fetchone()[0] == [{"isbn": "A"}]
