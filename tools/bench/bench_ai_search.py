#!/usr/bin/env python3
"""
AI 검색 부하(반복) 측정:
 - E2E: Spring /api/ai/search (Spring -> FastAPI WebClient 포함)
 - Direct: FastAPI /api/ai/search

외부 의존성 없이, 기존 bench_http.py 출력(p95/rps/ok/fail)을 파싱해
3회 반복 평균/범위를 출력합니다.

예)
  python3 tools/bench/bench_ai_search.py --query "스릴러 소설 추천해줘" -n 30 -c 3 --runs 3
"""

from __future__ import annotations

import argparse
import re
import statistics
import subprocess
import sys
from dataclasses import dataclass


P95_RE = re.compile(r"p95=(?P<p95>\d+\.\d+)")
RPS_RE = re.compile(r"rps=(?P<rps>\d+\.\d+)")
OK_RE = re.compile(r"ok=(?P<ok>\d+)\s+fail=(?P<fail>\d+)")


@dataclass
class BenchRun:
    p95_ms: float
    rps: float
    ok: int
    fail: int


def sh(cmd: list[str]) -> str:
    out = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
    return out.decode("utf-8", errors="replace")


def run_once(url: str, payload_json: str, n: int, c: int, timeout: float, warmup: int) -> BenchRun:
    out = sh(
        [
            sys.executable,
            "tools/bench/bench_http.py",
            "--method",
            "POST",
            "--url",
            url,
            "--json",
            payload_json,
            "-n",
            str(n),
            "-c",
            str(c),
            "--timeout",
            str(timeout),
            "--warmup",
            str(warmup),
        ]
    )

    m_p95 = P95_RE.search(out)
    m_rps = RPS_RE.search(out)
    m_ok = OK_RE.search(out)
    if not (m_p95 and m_rps and m_ok):
        raise RuntimeError(f"Failed to parse bench output:\n{out}")

    return BenchRun(
        p95_ms=float(m_p95.group("p95")),
        rps=float(m_rps.group("rps")),
        ok=int(m_ok.group("ok")),
        fail=int(m_ok.group("fail")),
    )


def summarize(label: str, runs: list[BenchRun]) -> None:
    p95s = [r.p95_ms for r in runs]
    rpss = [r.rps for r in runs]
    ok = sum(r.ok for r in runs)
    fail = sum(r.fail for r in runs)
    total = ok + fail
    err_rate = (fail / total * 100.0) if total else 0.0
    print(f"[{label}] runs={len(runs)} total_req={total} error_rate={err_rate:.1f}%")
    print(f"  p95_ms avg={statistics.mean(p95s):.2f} range={min(p95s):.2f}~{max(p95s):.2f}")
    print(f"  rps    avg={statistics.mean(rpss):.2f} range={min(rpss):.2f}~{max(rpss):.2f}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--query", required=True)
    p.add_argument("-n", "--requests", type=int, default=30)
    p.add_argument("-c", "--concurrency", type=int, default=3)
    p.add_argument("--runs", type=int, default=3)
    p.add_argument("--timeout", type=float, default=20.0)
    p.add_argument("--spring-base", default="http://localhost:8080")
    p.add_argument("--fastapi-base", default="http://localhost:8000")
    args = p.parse_args()

    spring_url = f"{args.spring_base}/api/ai/search"
    fastapi_url = f"{args.fastapi_base}/api/ai/search"
    payload = f'{{"query":"{args.query}"}}'

    # E2E: warmup 1회(미측정) 후 runs 반복
    _ = run_once(spring_url, payload, n=max(1, args.concurrency), c=1, timeout=args.timeout, warmup=0)
    e2e_runs = [run_once(spring_url, payload, args.requests, args.concurrency, args.timeout, warmup=0) for _ in range(args.runs)]

    # Direct: warmup 1회(미측정) 후 runs 반복
    _ = run_once(fastapi_url, payload, n=max(1, args.concurrency), c=1, timeout=args.timeout, warmup=0)
    direct_runs = [run_once(fastapi_url, payload, args.requests, args.concurrency, args.timeout, warmup=0) for _ in range(args.runs)]

    summarize("E2E(Spring->FastAPI)", e2e_runs)
    summarize("Direct(FastAPI)", direct_runs)


if __name__ == "__main__":
    main()







