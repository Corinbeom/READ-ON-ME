"""Observe database work for one reviewed search on its own SQLAlchemy session."""
from contextlib import contextmanager
from time import perf_counter

from sqlalchemy import event


@contextmanager
def measure_search_db(session, timings):
    # The released index is already in memory. The first search SQL locks the
    # selected candidates. After the reranker returns, SQL reads/stores receipts.
    started = perf_counter()
    first_statement = None

    def measure_statement(state):
        nonlocal first_statement
        before = perf_counter()
        if first_statement is None:
            first_statement = before
        key = "evidence_db_ms" if "rerank_ms" in timings else "input_db_ms"
        try:
            return state.invoke_statement()
        finally:
            timings[key] += (perf_counter() - before) * 1000

    event.listen(session.sync_session, "do_orm_execute", measure_statement, retval=True)
    try:
        yield
    finally:
        end = perf_counter()
        event.remove(session.sync_session, "do_orm_execute", measure_statement)
        # An empty shortlist may return without executing any candidate SQL.
        until_sql_ms = ((first_statement if first_statement is not None else end) - started) * 1000
        model_ms = timings.get("rerank_ms", 0.0) if first_statement is None else 0.0
        timings["candidate_ms"] = max(0.0, until_sql_ms - timings.get("embed_ms", 0.0) - model_ms)
