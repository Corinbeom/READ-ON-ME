import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import create_engine, pool
from sqlalchemy.engine import make_url

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models.book_corpus import BookCorpus
from app.models.book_tagging_job import BookTaggingJob
from app.models.corpus_ingestion_job import CorpusIngestionJob


config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name, disable_existing_loggers=False)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
target_metadata = Base.metadata


def _url():
    raw = os.getenv("DATABASE_URL")
    if not raw:
        raise RuntimeError("DATABASE_URL is required for migrations")
    return make_url(raw).set(drivername="postgresql+psycopg2")


def run_migrations_offline():
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
