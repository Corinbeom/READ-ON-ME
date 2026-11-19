from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import unittest
from unittest.mock import patch

spec = spec_from_file_location("public_uptime", Path(__file__).parents[1] / "check-public-uptime.py")
uptime = module_from_spec(spec)
spec.loader.exec_module(uptime)


class PublicUptimeTest(unittest.TestCase):
    def test_detects_missing_home_and_books(self):
        self.assertFalse(uptime.home_page(b"<html>Maintenance</html>"))
        self.assertTrue(uptime.home_page(b'<div data-testid="home-tab-screen">'))
        self.assertFalse(uptime.book_catalog(b"[]"))
        self.assertFalse(uptime.book_catalog(b'{"status":"UP"}'))
        self.assertTrue(uptime.book_catalog(b'[{"isbn13":"9788998441012"}]'))

    def test_retries_a_bad_body_and_recovers(self):
        with patch.object(uptime, "fetch", side_effect=[b"[]", b'[{"isbn13":"9788998441012"}]']) as fetch:
            with patch.object(uptime.time, "sleep") as sleep:
                self.assertTrue(uptime.probe("test", "https://example.test", uptime.book_catalog))
        self.assertEqual(fetch.call_count, 2)
        sleep.assert_called_once_with(20)

    def test_fails_after_two_bad_responses(self):
        with patch.object(uptime, "fetch", return_value=b"Not JSON") as fetch:
            with patch.object(uptime.time, "sleep"):
                self.assertFalse(uptime.probe("test", "https://example.test", uptime.book_catalog))
        self.assertEqual(fetch.call_count, 2)
