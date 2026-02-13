#!/usr/bin/env python3
"""
간단 HTTP 벤치마크(외부 의존성 없음).

예)
  python tools/bench/bench_http.py --url "http://localhost:8080/api/books/search?query=미움받을용기&size=10" -n 200 -c 10
  python tools/bench/bench_http.py --method POST --url "http://localhost:8080/api/ai/search" --json '{"query":"스릴러 추천"}' -n 50 -c 5
"""

from __future__ import annotations

import argparse
import json
import math
import queue
import statistics
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional


@dataclass
class Result:
    ok: bool
    status: Optional[int]
    latency_ms: float
    error: Optional[str] = None


def percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return float("nan")
    if p <= 0:
        return sorted_values[0]
    if p >= 100:
        return sorted_values[-1]
    k = (len(sorted_values) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_values[int(k)]
    d0 = sorted_values[f] * (c - k)
    d1 = sorted_values[c] * (k - f)
    return d0 + d1


def normalize_url(url: str) -> str:
    """
    Ensure URL is safe for HTTP request line by percent-encoding non-ascii in
    path/query while preserving reserved delimiters.
    """
    parts = urllib.parse.urlsplit(url)
    # path: keep "/" and "%" (already-encoded)
    path = urllib.parse.quote(parts.path, safe="/%")
    # query: keep common delimiters and "%" to preserve existing escapes
    query = urllib.parse.quote(parts.query, safe="=&%")
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))


def one_request(method: str, url: str, json_body: Optional[str], timeout: float) -> Result:
    # 한글 등 non-ascii가 포함된 URL은 HTTP request line에서 깨질 수 있으므로 인코딩 처리
    url = normalize_url(url)
    data = None
    headers = {"User-Agent": "bench_http.py"}
    if json_body is not None:
        data = json_body.encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url=url, method=method.upper(), data=data, headers=headers)
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            _ = resp.read(1)  # 최소 1바이트 읽어 실제 응답을 받았는지 확인
            elapsed_ms = (time.perf_counter() - start) * 1000
            return Result(ok=True, status=resp.status, latency_ms=elapsed_ms)
    except urllib.error.HTTPError as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return Result(ok=False, status=e.code, latency_ms=elapsed_ms, error=f"HTTPError {e.code}")
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return Result(ok=False, status=None, latency_ms=elapsed_ms, error=repr(e))


def worker(q: "queue.Queue[int]", out: list[Result], lock: threading.Lock, args) -> None:
    while True:
        try:
            _ = q.get_nowait()
        except queue.Empty:
            return
        r = one_request(args.method, args.url, args.json, args.timeout)
        with lock:
            out.append(r)
        q.task_done()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True)
    p.add_argument("--method", default="GET")
    p.add_argument("--json", help="POST/PUT body as raw JSON string")
    p.add_argument("-n", "--requests", type=int, default=100)
    p.add_argument("-c", "--concurrency", type=int, default=10)
    p.add_argument("--timeout", type=float, default=10.0)
    p.add_argument("--warmup", type=int, default=5)
    args = p.parse_args()

    if args.json is not None:
        # JSON 유효성 최소 확인(실수 방지)
        json.loads(args.json)

    # warmup
    for _ in range(max(args.warmup, 0)):
        _ = one_request(args.method, args.url, args.json, args.timeout)

    q: queue.Queue[int] = queue.Queue()
    for i in range(args.requests):
        q.put(i)

    results: list[Result] = []
    lock = threading.Lock()
    threads = [
        threading.Thread(target=worker, args=(q, results, lock, args), daemon=True)
        for _ in range(max(1, args.concurrency))
    ]

    t0 = time.perf_counter()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    total_s = time.perf_counter() - t0

    latencies = sorted(r.latency_ms for r in results)
    ok = sum(1 for r in results if r.ok)
    fail = len(results) - ok
    rps = len(results) / total_s if total_s > 0 else 0.0

    print(f"url={args.url}")
    print(f"method={args.method} requests={len(results)} concurrency={args.concurrency} total_s={total_s:.2f} rps={rps:.2f}")
    print(f"ok={ok} fail={fail}")
    if fail:
        errors = {}
        for r in results:
            if r.ok:
                continue
            errors[r.error or "unknown"] = errors.get(r.error or "unknown", 0) + 1
        top = sorted(errors.items(), key=lambda kv: kv[1], reverse=True)[:5]
        print("top_errors=", top)

    if latencies:
        print(f"latency_ms min={min(latencies):.2f} mean={statistics.mean(latencies):.2f} p50={percentile(latencies, 50):.2f} p95={percentile(latencies, 95):.2f} p99={percentile(latencies, 99):.2f} max={max(latencies):.2f}")


if __name__ == "__main__":
    main()


