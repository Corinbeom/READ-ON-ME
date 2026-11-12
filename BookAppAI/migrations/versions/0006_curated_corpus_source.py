"""Keep reviewed ISBN intake separate from keyword batches and user libraries.

Revision ID: 0006_curated_corpus_source
Revises: 0005_scope_batch_candidates
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_curated_corpus_source"
down_revision = "0005_scope_batch_candidates"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        "uq_corpus_curated_book_isbn", "corpus_ingestion_jobs", ["isbn"],
        unique=True, postgresql_where=sa.text("job_type = 'BOOK' AND source = 'CURATED_SEED'"),
    )


def downgrade():
    op.drop_index("uq_corpus_curated_book_isbn", table_name="corpus_ingestion_jobs")
