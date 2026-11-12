"""Store ISBN-verified library classification alongside corpus books.

Revision ID: 0008_kdc_provenance
Revises: 0007_gemini_embedding_shadow
"""

import sqlalchemy as sa
from alembic import op


revision = "0008_kdc_provenance"
down_revision = "0007_gemini_embedding_shadow"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("book_corpus", sa.Column("kdc_code", sa.String(20), nullable=True))
    op.add_column("book_corpus", sa.Column("kdc_source", sa.String(30), nullable=True))
    op.add_column("book_corpus", sa.Column("kdc_checked_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("book_corpus", "kdc_checked_at")
    op.drop_column("book_corpus", "kdc_source")
    op.drop_column("book_corpus", "kdc_code")
