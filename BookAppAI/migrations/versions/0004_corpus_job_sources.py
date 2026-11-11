"""Keep Kakao batch and user-library decisions separate for the same ISBN.

Revision ID: 0004_corpus_job_sources
Revises: 0003_corpus_ingestion
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_corpus_job_sources"
down_revision = "0003_corpus_ingestion"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index("uq_corpus_book_job_isbn", table_name="corpus_ingestion_jobs")
    op.create_index(
        "uq_corpus_book_job_isbn_source", "corpus_ingestion_jobs", ["isbn", "source"],
        unique=True, postgresql_where=sa.text("job_type = 'BOOK'"),
    )


def downgrade():
    op.drop_index("uq_corpus_book_job_isbn_source", table_name="corpus_ingestion_jobs")
    op.create_index(
        "uq_corpus_book_job_isbn", "corpus_ingestion_jobs", ["isbn"],
        unique=True, postgresql_where=sa.text("job_type = 'BOOK'"),
    )
