"""Bind reviewed values and derived artifacts to immutable input versions."""

from alembic import op

revision = "0009_field_permissions"
down_revision = "0008_kdc_provenance"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE corpus_use_policy (
            provider text NOT NULL,
            version text NOT NULL,
            evidence_ref text NOT NULL CHECK (length(trim(evidence_ref)) > 0),
            checked_on date NOT NULL,
            uses text[] NOT NULL DEFAULT '{}',
            active boolean NOT NULL DEFAULT false,
            PRIMARY KEY (provider, version),
            CHECK (uses <@ ARRAY['store','display','publish_derivative','external_ai','store_embedding','commercial'])
        )
    """)
    op.execute("""
        CREATE TABLE corpus_field_versions (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            isbn text NOT NULL,
            field text NOT NULL CHECK (field IN ('title','authors','contents','thumbnail')),
            provider text NOT NULL,
            policy_version text NOT NULL,
            source_ref text NOT NULL,
            checked_on date NOT NULL,
            digest char(64) NOT NULL,
            value text,
            current boolean NOT NULL DEFAULT true,
            FOREIGN KEY (provider, policy_version) REFERENCES corpus_use_policy(provider, version)
        )
    """)
    op.execute("CREATE UNIQUE INDEX corpus_current_field ON corpus_field_versions(isbn, field) WHERE current")
    op.execute("""
        CREATE TABLE corpus_derived_artifacts (
            isbn text NOT NULL,
            input_version text NOT NULL,
            kind text NOT NULL CHECK (kind IN ('tags','embedding','reason')),
            model_version text NOT NULL,
            context_key text NOT NULL DEFAULT '',
            result jsonb NOT NULL,
            PRIMARY KEY (isbn, kind, input_version, model_version, context_key)
        )
    """)


def downgrade():
    raise RuntimeError("Review evidence and derived records require a separately approved migration")
