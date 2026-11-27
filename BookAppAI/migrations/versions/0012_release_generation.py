"""Invalidate reviewed release proofs in the same transaction as their inputs."""

from alembic import op

revision = "0012_release_generation"
down_revision = "0011_shelf_keywords"
branch_labels = None
depends_on = None

INPUT_TABLES = ("corpus_use_policy", "corpus_field_versions", "corpus_quality_runs")


def upgrade():
    op.execute("""
        CREATE TABLE corpus_release_generation (
            singleton boolean PRIMARY KEY CHECK (singleton),
            generation uuid NOT NULL DEFAULT gen_random_uuid()
        )
    """)
    op.execute("INSERT INTO corpus_release_generation (singleton) VALUES (true)")
    op.execute("""
        CREATE FUNCTION invalidate_reviewed_release() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE corpus_release_generation SET generation = gen_random_uuid() WHERE singleton;
            RETURN NULL;
        END
        $$
    """)
    for table in INPUT_TABLES:
        op.execute(f"""
            CREATE TRIGGER release_inputs_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON {table}
            FOR EACH STATEMENT EXECUTE FUNCTION invalidate_reviewed_release()
        """)
    # Search writes recommendation reasons. Only tags and embeddings enter the release proof.
    for event, condition in (
        ("INSERT", "NEW.kind IN ('tags','embedding')"),
        ("DELETE", "OLD.kind IN ('tags','embedding')"),
        ("UPDATE", "OLD.kind IN ('tags','embedding') OR NEW.kind IN ('tags','embedding')"),
    ):
        op.execute(f"""
            CREATE TRIGGER release_artifact_{event} AFTER {event} ON corpus_derived_artifacts
            FOR EACH ROW WHEN ({condition}) EXECUTE FUNCTION invalidate_reviewed_release()
        """)
    op.execute("""
        CREATE TRIGGER release_inputs_changed AFTER TRUNCATE ON corpus_derived_artifacts
        FOR EACH STATEMENT EXECUTE FUNCTION invalidate_reviewed_release()
    """)


def downgrade():
    for table in (*INPUT_TABLES, "corpus_derived_artifacts"):
        op.execute(f"DROP TRIGGER release_inputs_changed ON {table}")
    for event in ("insert", "delete", "update"):
        op.execute(f"DROP TRIGGER release_artifact_{event} ON corpus_derived_artifacts")
    op.execute("DROP FUNCTION invalidate_reviewed_release()")
    op.execute("DROP TABLE corpus_release_generation")
