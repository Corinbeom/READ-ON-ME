"""Allow the same ISBN to be evaluated by separate keyword batches.

Revision ID: 0005_scope_batch_candidates
Revises: 0004_corpus_job_sources
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_scope_batch_candidates"
down_revision = "0004_corpus_job_sources"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index("uq_corpus_book_job_isbn_source", table_name="corpus_ingestion_jobs")
    op.create_index(
        "uq_corpus_batch_book_run", "corpus_ingestion_jobs", ["isbn", "run_id"],
        unique=True, postgresql_where=sa.text("job_type = 'BOOK' AND source = 'KAKAO_BATCH'"),
    )
    op.create_index(
        "uq_corpus_user_book_isbn", "corpus_ingestion_jobs", ["isbn"],
        unique=True, postgresql_where=sa.text("job_type = 'BOOK' AND source = 'USER_LIBRARY'"),
    )


def downgrade():
    # A global ISBN/source index cannot represent jobs from multiple runs.
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM corpus_ingestion_jobs
                WHERE job_type = 'BOOK' AND source = 'KAKAO_BATCH'
                GROUP BY isbn HAVING count(*) > 1
            ) THEN
                RAISE EXCEPTION 'Cannot downgrade: multiple batch jobs exist for the same ISBN';
            END IF;
        END $$;
    """)
    op.drop_index("uq_corpus_user_book_isbn", table_name="corpus_ingestion_jobs")
    op.drop_index("uq_corpus_batch_book_run", table_name="corpus_ingestion_jobs")
    op.create_index(
        "uq_corpus_book_job_isbn_source", "corpus_ingestion_jobs", ["isbn", "source"],
        unique=True, postgresql_where=sa.text("job_type = 'BOOK'"),
    )
