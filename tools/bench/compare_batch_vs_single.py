#!/usr/bin/env python3
"""
추천 ID -> 도서 상세 매핑 비용 비교:
 - 단건 상세 조회 K회 (/api/books/detail/{isbn})
 - 배치 상세 조회 1회 (/api/books/details)

요구사항:
 - Spring이 localhost:8080에서 떠있어야 함
 - /api/books/popular 이 Book 배열을 반환(id, isbn13 포함)

예)
  python tools/bench/compare_batch_vs_single.py --k 10
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request


def http_get_json(url: str):
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_json(url: str, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, method="POST", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://localhost:8080")
    p.add_argument("--k", type=int, default=10)
    args = p.parse_args()

    popular = http_get_json(f"{args.base}/api/books/popular")
    if not isinstance(popular, list) or not popular:
        raise SystemExit("popular list is empty; add some books first")

    sample = popular[: args.k]
    isbns = [b.get("isbn13") for b in sample]
    ids = [b.get("id") for b in sample]
    if any(not x for x in isbns) or any(x is None for x in ids):
        raise SystemExit("popular items must include isbn13 and id")

    # 단건 K회
    t0 = time.perf_counter()
    for isbn in isbns:
        _ = http_get_json(f"{args.base}/api/books/detail/{isbn}")
    single_s = time.perf_counter() - t0

    # 배치 1회
    t1 = time.perf_counter()
    _ = http_post_json(f"{args.base}/api/books/details", ids)
    batch_s = time.perf_counter() - t1

    print(f"K={args.k}")
    print(f"single_calls={args.k} single_total_ms={single_s*1000:.2f}")
    print(f"batch_calls=1 batch_total_ms={batch_s*1000:.2f}")
    if batch_s > 0:
        print(f"speedup_x={single_s/batch_s:.2f}")
    print(f"request_count_reduction={(args.k-1)/args.k*100:.1f}%")


if __name__ == "__main__":
    main()








