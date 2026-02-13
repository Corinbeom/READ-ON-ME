#!/usr/bin/env python3
"""
검색 캐시 효과를 '3회 반복 + Redis hit rate'까지 포함해 한 번에 뽑는 스크립트.

전제:
 - docker-compose로 redis 컨테이너(readonme-redis)가 실행 중
 - Spring이 localhost:8080에서 실행 중

예)
  python tools/bench/bench_cache_search.py --query "미움받을용기" -n 80 -c 10 --runs 3
"""

from __future__ import annotations

import argparse
import re
import statistics
import subprocess
import sys
from dataclasses import dataclass


LAT_RE = re.compile(r"p95=(?P<p95>\d+\.\d+)")
RPS_RE = re.compile(r"rps=(?P<rps>\d+\.\d+)")


@dataclass
class BenchRun:
    p95_ms: float
    rps: float


def sh(cmd: list[str]) -> str:
    out = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
    return out.decode("utf-8", errors="replace")


def redis_info_stats() -> dict[str, int]:
    raw = sh(["docker", "exec", "readonme-redis", "redis-cli", "INFO", "stats"])
    stats: dict[str, int] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        if k in {"keyspace_hits", "keyspace_misses"}:
            try:
                stats[k] = int(v.strip())
            except ValueError:
                continue
    return stats


def redis_flushall() -> None:
    _ = sh(["docker", "exec", "readonme-redis", "redis-cli", "FLUSHALL"])


def run_bench(url: str, n: int, c: int) -> BenchRun:
    out = sh([sys.executable, "tools/bench/bench_http.py", "--url", url, "-n", str(n), "-c", str(c), "--warmup", "0"])
    m1 = LAT_RE.search(out)
    m2 = RPS_RE.search(out)
    if not m1 or not m2:
        raise RuntimeError(f"Failed to parse bench output:\n{out}")
    return BenchRun(p95_ms=float(m1.group("p95")), rps=float(m2.group("rps")))


def summarize(label: str, runs: list[BenchRun]) -> None:
    p95s = [r.p95_ms for r in runs]
    rpss = [r.rps for r in runs]
    print(f"[{label}] runs={len(runs)}")
    print(f"  p95_ms avg={statistics.mean(p95s):.2f} range={min(p95s):.2f}~{max(p95s):.2f}")
    print(f"  rps    avg={statistics.mean(rpss):.2f} range={min(rpss):.2f}~{max(rpss):.2f}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--query", required=True)
    p.add_argument("-n", "--requests", type=int, default=80)
    p.add_argument("-c", "--concurrency", type=int, default=10)
    p.add_argument("--runs", type=int, default=3)
    p.add_argument("--size", type=int, default=10)
    p.add_argument("--base", default="http://localhost:8080")
    args = p.parse_args()

    url = f"{args.base}/api/books/search?query={args.query}&size={args.size}"

    # Cold: 매 회 FLUSHALL로 "캐시 미스" 조건을 고정 (runs 번 반복)
    cold_runs: list[BenchRun] = []
    for _ in range(args.runs):
        redis_flushall()
        cold_runs.append(run_bench(url, args.requests, args.concurrency))

    # Warm: 1회 warm-up(미측정) 후, 동일 조건 반복(runs 번) -> "캐시 히트" 조건
    redis_flushall()
    _ = run_bench(url, max(1, args.concurrency), 1)  # warm-up (미측정)
    warm_stats_before = redis_info_stats()
    warm_runs = [run_bench(url, args.requests, args.concurrency) for _ in range(args.runs)]
    warm_stats_after = redis_info_stats()

    summarize("cold", cold_runs)
    summarize("warm", warm_runs)

    dh = warm_stats_after.get("keyspace_hits", 0) - warm_stats_before.get("keyspace_hits", 0)
    dm = warm_stats_after.get("keyspace_misses", 0) - warm_stats_before.get("keyspace_misses", 0)
    total = dh + dm
    hit_rate = (dh / total * 100.0) if total > 0 else float("nan")
    print(f"[redis] warm_keyspace_hits={dh} warm_keyspace_misses={dm} warm_hit_rate={hit_rate:.1f}%")


if __name__ == "__main__":
    main()


