"""Persist corpus ingestion work and recommendation eligibility.

Revision ID: 0003_corpus_ingestion
Revises: 0002_tagging_jobs
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "0003_corpus_ingestion"
down_revision = "0002_tagging_jobs"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("book_corpus", sa.Column("recommendation_status", sa.String(20), nullable=False, server_default="LEGACY"))
    op.add_column("book_corpus", sa.Column("source", sa.String(30)))
    op.add_column("book_corpus", sa.Column("classification_version", sa.String(100)))
    op.add_column("book_corpus", sa.Column("validated_at", sa.DateTime(timezone=True)))
    op.create_index("idx_book_corpus_recommendation_status", "book_corpus", ["recommendation_status"])
    op.create_table(
        "corpus_ingestion_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("job_type", sa.String(10), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("isbn", sa.String(20)),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("corpus_ingestion_jobs.id")),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("payload", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("progress", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("error_code", sa.String(40)),
        sa.Column("reject_reason", sa.String(80)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_corpus_jobs_due", "corpus_ingestion_jobs", ["status", "next_attempt_at"])
    op.create_index("idx_corpus_jobs_run", "corpus_ingestion_jobs", ["run_id"])
    op.create_index("uq_corpus_book_job_isbn", "corpus_ingestion_jobs", ["isbn"], unique=True, postgresql_where=sa.text("job_type = 'BOOK'"))


def downgrade():
    op.drop_index("uq_corpus_book_job_isbn", table_name="corpus_ingestion_jobs")
    op.drop_index("idx_corpus_jobs_run", table_name="corpus_ingestion_jobs")
    op.drop_index("idx_corpus_jobs_due", table_name="corpus_ingestion_jobs")
    op.drop_table("corpus_ingestion_jobs")
    op.drop_index("idx_book_corpus_recommendation_status", table_name="book_corpus")
    for name in ("validated_at", "classification_version", "source", "recommendation_status"):
        op.drop_column("book_corpus", name)
