import json
import os
import subprocess
import time


def fetch(url):
    response = subprocess.run(
        ["curl", "--fail", "--silent", "--show-error", "--max-time", "12",
         "--max-filesize", "1000000", "--write-out", "\n%{http_code}", url],
        capture_output=True, check=True,
    )
    body, _, status = response.stdout.rpartition(b"\n")
    if status != b"200":
        raise ValueError(f"unexpected HTTP {status.decode('ascii', errors='replace')}")
    return body


def home_page(body):
    return b'data-testid="home-tab-screen"' in body


def book_catalog(body):
    books = json.loads(body)
    return isinstance(books, list) and any(
        isinstance(book, dict) and isinstance(book.get("isbn13"), str) and book["isbn13"].strip()
        for book in books
    )


def probe(label, url, valid):
    for attempt in (1, 2):
        try:
            if not valid(fetch(url)):
                raise ValueError("unexpected response body")
            print(f"{label}: healthy (attempt {attempt})", flush=True)
            return True
        except (OSError, ValueError, subprocess.CalledProcessError) as error:
            reason = error.stderr.decode().strip() if isinstance(error, subprocess.CalledProcessError) else str(error)
            print(f"{label}: attempt {attempt} failed ({reason})", flush=True)
            if attempt == 1:
                time.sleep(20)
    return False


if __name__ == "__main__":
    backend = os.environ.get("WEB_API_URL", "https://152.67.222.15").rstrip("/")
    web_ok = probe("Home", "https://read-on-me-beta.pages.dev/", home_page)
    api_ok = probe("Public books API", backend + "/api/books/popular/naru", book_catalog)
    raise SystemExit(0 if web_ok and api_ok else 1)
