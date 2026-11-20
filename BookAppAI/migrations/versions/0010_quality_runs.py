"""Store a graded run only once for its evaluated release."""

from alembic import op

revision = "0010_quality_runs"
down_revision = "0009_field_permissions"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE corpus_quality_runs (
            run_id uuid PRIMARY KEY, release char(64) NOT NULL, evidence_digest char(64) UNIQUE NOT NULL,
            first_match integer NOT NULL CHECK (first_match BETWEEN 0 AND 18),
            any_match integer NOT NULL CHECK (any_match BETWEEN first_match AND 18),
            controls integer NOT NULL CHECK (controls BETWEEN 0 AND 2),
            checked_at timestamptz NOT NULL DEFAULT now()
        )
    """)


def downgrade():
    raise RuntimeError("Quality evidence requires a separately approved migration")
