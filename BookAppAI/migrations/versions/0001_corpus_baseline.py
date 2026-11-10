"""Create the existing book corpus on fresh databases.

Revision ID: 0001_corpus_baseline
Revises:
"""

from alembic import op


revision = "0001_corpus_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("""
        CREATE TABLE IF NOT EXISTS book_corpus (
            id BIGSERIAL PRIMARY KEY,
            title VARCHAR NOT NULL,
            contents TEXT,
            isbn VARCHAR NOT NULL UNIQUE,
            authors VARCHAR,
            publisher VARCHAR,
            thumbnail VARCHAR,
            keyword VARCHAR NOT NULL,
            similarity_score DOUBLE PRECISION NOT NULL,
            embedding VECTOR(768) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            tags JSONB DEFAULT '[]'::jsonb
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_book_corpus_isbn ON book_corpus (isbn)")


def downgrade():
    # This revision also baselines pre-existing corpus tables. A downgrade cannot
    # tell whether the table predates Alembic, so preserve user data.
    pass
