from copy import deepcopy

import pytest

from app.corpus_policy import EMBEDDING_USES
from app.services.reviewed_corpus import digest
from tools.promote_reviewed import additions, validate


def batch():
    isbn = "9780306406157"
    version = "1,2,3"
    return {
        "base": {"editions": {}}, "release": "new", "additions": {isbn: [version, "tags", "vector"]},
        "fields": [{"isbn": isbn, "id": i, "field": name, "provider": "SELF", "policy_version": "1",
                    "current": False, "value": name, "digest": digest(name)}
                   for i, name in enumerate(("authors", "contents", "title"), start=1)],
        "policies": [{"provider": "SELF", "version": "1", "active": True, "uses": list(EMBEDDING_USES)}],
        "artifacts": [{"isbn": isbn, "input_version": version, "kind": kind, "context_key": ""}
                      for kind in ("tags", "embedding")],
        "runs": [{"release": "new", "run_id": i, "first_match": 13, "any_match": 15, "controls": 2} for i in (1, 2)]
    }


def test_only_new_editions_can_be_promoted():
    assert additions({"a": [1]}, {"a": [1], "b": [2]}) == {"b": [2]}
    for target in ({}, {"a": [2]}):
        with pytest.raises(ValueError):
            additions({"a": [1]}, target)


@pytest.mark.parametrize("table,key,value", [
    ("fields", "id", 2), ("fields", "current", True), ("fields", "value", "changed"),
    ("artifacts", "input_version", "old"), ("policies", "active", False), ("runs", "first_match", 12),
])
def test_altered_bundle_is_rejected(table, key, value):
    bundle = batch()
    validate(bundle)
    changed = deepcopy(bundle)
    changed[table][0][key] = value
    with pytest.raises(ValueError):
        validate(changed)
