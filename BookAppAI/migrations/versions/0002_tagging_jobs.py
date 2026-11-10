"""Persist failed book tagging for bounded retries.

Revision ID: 0002_tagging_jobs
Revises: 0001_corpus_baseline
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_tagging_jobs"
down_revision = "0001_corpus_baseline"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "book_tagging_jobs",
        sa.Column("isbn", sa.String(), sa.ForeignKey("book_corpus.isbn", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("model_version", sa.String(100), nullable=False),
        sa.Column("last_error_code", sa.String(40)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_book_tagging_jobs_due", "book_tagging_jobs", ["status", "next_attempt_at"])


def downgrade():
    op.drop_index("idx_book_tagging_jobs_due", table_name="book_tagging_jobs")
    op.drop_table("book_tagging_jobs")
