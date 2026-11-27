"""Exercise release transitions with a fake Docker host and health checks."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "pull-server-release.sh"
REVISION = "a" * 40
REGISTRY = "ghcr.io/corinbeom/read-on-me"
SPRING = f"{REGISTRY}/spring@sha256:" + "b" * 64
AI = f"{REGISTRY}/ai@sha256:" + "c" * 64
OLD = {"backend": "readonme-back:old", "ai": "readonme-ai:old"}

DOCKER = r'''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import re
import sys

args = sys.argv[1:]
state = Path("containers.json")
images = json.loads(state.read_text())
with Path("calls.jsonl").open("a") as log:
    print(json.dumps(args), file=log)
def configured_image(path, service):
    refs = re.findall(r'image: "([^"]+)"', Path(path).read_text())
    return refs[0 if service == "backend" else 1]
if args[:2] == ["image", "inspect"]:
    print(os.environ["LABELS"])
elif args[0] == "inspect":
    print(images[args[-1]])
elif args[0] == "compose":
    if "config" in args:
        print(configured_image(args[2], args[-1]))
    elif "ps" in args:
        print(args[-1])
    elif "up" in args:
        images[args[-1]] = configured_image(args[4], args[-1])
        state.write_text(json.dumps(images))
    elif "exec" in args:
        if "postgres" in args:
            print("test backup")
        elif os.environ.get("FAIL_AI") and images["ai"] == os.environ["LABELS"].split()[2]:
            sys.exit(1)
'''


class PullServerReleaseTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        bin_path = self.root / "bin"
        bin_path.mkdir()
        (self.root / "deploy-status").mkdir()
        (self.root / "containers.json").write_text(json.dumps(OLD))
        for name, source in {"docker": DOCKER, "flock": "#!/bin/sh\nexit 0",
                             "sleep": "#!/bin/sh\nexit 0", "curl": "#!/bin/sh\nexit 0"}.items():
            executable = bin_path / name
            executable.write_text(source)
            executable.chmod(0o700)
        self.env = {
            **os.environ, "PATH": f"{bin_path}:{os.environ['PATH']}", "READONME_DIR": str(self.root),
            "LABELS": f"{REVISION} {SPRING} {AI} 123.1",
        }

    def deploy(self, *args, **env):
        return subprocess.run(["bash", str(SCRIPT), *args], env={**self.env, **env},
                              capture_output=True, text=True, timeout=30)

    def containers(self):
        return json.loads((self.root / "containers.json").read_text())

    def test_check_has_no_effect_then_deploy_publishes_only_the_applied_revision(self):
        self.assertEqual(self.deploy("--check").returncode, 0)
        self.assertEqual(self.containers(), OLD)
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.containers(), {"backend": SPRING, "ai": AI})
        self.assertEqual(json.loads((self.root / "deploy-status/server-release.json").read_text()),
                         {"commit": REVISION})
        self.assertTrue((self.root / ".oci-deploy/db-backup.dump").is_file())
        self.assertEqual(self.mutations(), [("stop", "ai"), ("up", "backend"), ("up", "ai")])

    def test_unhealthy_ai_rolls_back_and_skips_the_same_attempt(self):
        result = self.deploy(FAIL_AI="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.containers(), OLD)
        self.assertFalse((self.root / "deploy-status/server-release.json").exists())
        self.assertEqual(self.deploy().returncode, 0)
        self.assertEqual(self.containers(), OLD)

    def mutations(self):
        calls = (json.loads(line) for line in (self.root / "calls.jsonl").read_text().splitlines())
        return [(verb, args[-1]) for args in calls for verb in ("up", "stop") if verb in args]

    def start_with_matching_spring(self):
        old = {"backend": SPRING, "ai": OLD["ai"]}
        (self.root / "containers.json").write_text(json.dumps(old))
        marker = self.root / "deploy-status/server-release.json"
        marker.write_text(json.dumps({"commit": "f" * 40}))
        return old

    def test_ai_only_apply_keeps_spring_running(self):
        self.start_with_matching_spring()
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.mutations(), [("up", "ai")])
        self.assertEqual(self.containers(), {"backend": SPRING, "ai": AI})
        self.assertEqual(json.loads((self.root / "deploy-status/server-release.json").read_text())["commit"], REVISION)

    def test_ai_only_failure_restores_only_ai_and_preserves_release(self):
        old = self.start_with_matching_spring()
        self.assertNotEqual(self.deploy(FAIL_AI="1").returncode, 0)
        self.assertEqual(self.mutations(), [("up", "ai"), ("up", "ai")])
        self.assertEqual(self.containers(), old)
        self.assertEqual(json.loads((self.root / "deploy-status/server-release.json").read_text())["commit"], "f" * 40)
        self.assertEqual(self.deploy().returncode, 0)
        self.assertEqual(self.mutations(), [("up", "ai"), ("up", "ai")])

    def test_interrupted_ai_release_recovers_using_persisted_image_pair(self):
        old = self.start_with_matching_spring()
        state = self.root / ".oci-deploy"
        state.mkdir()
        (state / "rollback.yml").write_text(f'services:\n  backend:\n    image: "{SPRING}"\n  ai:\n    image: "{OLD["ai"]}"\n')
        (state / "last-attempt").write_text("123.1")
        (state / "in-progress").touch()
        (self.root / "containers.json").write_text(json.dumps({"backend": SPRING, "ai": AI}))
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.mutations(), [("up", "ai")])
        self.assertEqual(self.containers(), old)
        self.assertFalse((state / "in-progress").exists())

    def test_interrupted_publication_finishes_verified_marker_without_restarting(self):
        self.start_with_matching_spring()
        self.assertEqual(self.deploy().returncode, 0)
        state = self.root / ".oci-deploy"
        (self.root / "deploy-status/server-release.json").rename(state / "server-release.json")
        (state / "in-progress").write_text("verified")
        self.assertEqual(self.deploy().returncode, 0)
        self.assertEqual(self.mutations(), [("up", "ai")])
        self.assertEqual(json.loads((self.root / "deploy-status/server-release.json").read_text())["commit"], REVISION)

    def test_rejects_an_image_from_another_registry_before_touching_containers(self):
        result = self.deploy(LABELS=f"{REVISION} example.test/spring@sha256:{'b' * 64} {AI} 123.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.containers(), OLD)
