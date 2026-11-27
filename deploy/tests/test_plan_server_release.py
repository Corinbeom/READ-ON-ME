"""Use real Git trees and a synthetic registry to exercise the production release decision."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ".github/workflows/validation.yml"
REGISTRY = "example.test/readonme"
SPRING = "sha256:" + "1" * 64
AI = "sha256:" + "2" * 64


class PlanServerReleaseTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.repo = Path(tmp.name)
        self.git("init", "-q")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "user.name", "release tests")
        for path in [WORKFLOW, "deploy/publish-server-release.sh",
                     "deploy/plan-server-release.sh", "deploy/compare-server-inputs.rb"]:
            (self.repo / path).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, self.repo / path)
        for name in ("BookAppBack", "BookAppAI"):
            (self.repo / name).mkdir()
            (self.repo / name / "Dockerfile").write_text("FROM scratch\n")
        self.base = self.commit()
        self.bin = self.repo / ".git" / "bin"
        self.bin.mkdir()
        for name, code in {
            "docker": 'case "$1" in pull) exit 0;; image) echo "$PUBLISHED $SPRING_REF $AI_REF";; *) exit 1;; esac',
            "curl": 'echo "$MARKER"',
        }.items():
            exe = self.bin / name
            exe.write_text("#!/bin/sh\n" + code + "\n")
            exe.chmod(0o700)

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.repo, text=True).strip()

    def commit(self):
        self.git("add", ".")
        self.git("commit", "-qm", "release fixture")
        return self.git("rev-parse", "HEAD")

    def plan(self, target, *, published=None, attempt="1", event="push", applied=None, spring_ref=None):
        out = self.repo / ".git" / "output"
        out.write_text("")
        subprocess.run(["bash", "deploy/plan-server-release.sh"], cwd=self.repo, check=True,
                       capture_output=True, text=True, env={
                           **os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}",
                           "PUBLISHED": published or self.base, "MARKER": json.dumps({"commit": applied or self.base}),
                           "GITHUB_SHA": target, "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": attempt,
                           "GITHUB_EVENT_NAME": event, "GITHUB_OUTPUT": str(out), "REGISTRY": "example.test/readonme",
                           "WEB_API_URL": "https://example.test", "SPRING_REF": spring_ref or f"{REGISTRY}/spring@{SPRING}",
                           "AI_REF": f"{REGISTRY}/ai@{AI}",
                       })
        return {k: v for k, v in (line.split("=", 1) for line in out.read_text().splitlines()) if v}

    def test_web_change_reuses_published_server_even_when_oci_is_still_applying_it(self):
        (self.repo / "web.js").write_text("new web bundle")
        web = self.commit()
        self.assertEqual(self.plan(web, applied="c" * 40), {"mode": "reuse", "server_revision": self.base})
        self.assertEqual(self.plan(web, attempt="2")["mode"], "reuse")

    def test_server_change_followed_by_web_commit_includes_unpublished_server_change(self):
        (self.repo / "BookAppBack/Dockerfile").write_text("FROM scratch\nLABEL change=true")
        server = self.commit()
        (self.repo / "web.js").write_text("new web bundle")
        mixed = self.commit()
        self.assertEqual(self.plan(mixed), {"mode": "build", "server_revision": mixed})
        self.assertEqual(self.plan(mixed, published=server), {"mode": "reuse", "server_revision": server})

    def test_ai_context_and_build_options_each_invalidate_images(self):
        (self.repo / "BookAppAI/app.py").write_text("new code")
        ai = self.commit()
        self.assertEqual(self.plan(ai), {"mode": "ai", "server_revision": ai, "spring_digest": SPRING})
        workflow = self.repo / WORKFLOW
        workflow.write_text(workflow.read_text().replace("EMBEDDING_PROVIDER=gemini", "EMBEDDING_PROVIDER=local"))
        recipe = self.commit()
        self.assertEqual(self.plan(recipe, published=ai)["mode"], "ai")
        workflow.write_text(workflow.read_text().replace("docker/setup-buildx-action@v3", "docker/setup-buildx-action@v4"))
        self.assertEqual(self.plan(self.commit(), published=recipe)["mode"], "build")

    def test_operator_retry_and_forced_rebuild(self):
        self.assertEqual(self.plan(self.base, attempt="2", applied="d" * 40),
                         {"mode": "retry", "server_revision": self.base, "spring_digest": SPRING, "ai_digest": AI})
        self.assertEqual(self.plan(self.base, attempt="2")["mode"], "reuse")
        self.assertEqual(self.plan(self.base, event="workflow_dispatch")["mode"], "build")
        with self.assertRaises(subprocess.CalledProcessError):
            self.plan(self.base, published="unknown")
        with self.assertRaises(subprocess.CalledProcessError):
            self.plan(self.base, spring_ref=f"{REGISTRY}/ai@{SPRING}")
        with self.assertRaises(subprocess.CalledProcessError):
            self.plan(self.base, attempt="2", applied="unknown")
