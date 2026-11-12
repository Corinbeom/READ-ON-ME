"""Add a separate 768-dimensional Gemini vector without changing local vectors.

Revision ID: 0007_gemini_embedding_shadow
Revises: 0006_curated_corpus_source
"""

from alembic import op


revision = "0007_gemini_embedding_shadow"
down_revision = "0006_curated_corpus_source"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE book_corpus ADD COLUMN IF NOT EXISTS gemini_embedding VECTOR(768)")
    op.execute("ALTER TABLE book_corpus ALTER COLUMN embedding DROP NOT NULL")


def downgrade():
    # The old application can still use embedding; dropping the shadow column
    # would silently discard vectors generated after cutover.
    raise RuntimeError("Gemini embedding migration is data-preserving and cannot be downgraded")
