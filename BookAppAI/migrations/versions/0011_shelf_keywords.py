"""Register the local holdings index and deduplicate optional shelf tagging jobs."""
from alembic import op

revision = "0011_shelf_keywords"
down_revision = "0010_quality_runs"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        INSERT INTO corpus_use_policy VALUES ('SEONGNAM_HOLDINGS', '20260107',
            'https://www.data.go.kr/data/3071094/fileData.do', DATE '2026-11-23',
            ARRAY['store','display','publish_derivative','commercial'], true)
    """)
    op.execute("""
        CREATE TABLE shelf_keyword_jobs (
            isbn text NOT NULL, input_version text NOT NULL, model text NOT NULL,
            status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed','held')),
            attempts integer NOT NULL DEFAULT 0, run_after timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (isbn, input_version, model)
        )
    """)
    op.execute("CREATE INDEX shelf_keywords_due ON shelf_keyword_jobs(run_after) WHERE status='pending'")


def downgrade():
    raise RuntimeError("Removing shelf keyword records requires separate approval")
