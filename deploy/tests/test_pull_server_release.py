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
if args[:2] == ["image", "inspect"]:
    print(os.environ["LABELS"])
elif args[0] == "inspect":
    print(images[args[-1]])
elif args[0] == "compose":
    if "ps" in args:
        print(args[-1])
    elif "up" in args:
        images[args[-1]] = re.findall(r'image: "([^"]+)"', Path(args[4]).read_text())[
            0 if args[-1] == "backend" else 1
        ]
        state.write_text(json.dumps(images))
    elif "exec" in args:
        if "postgres" in args:
            print("test backup")
        elif os.environ.get("FAIL_AI") and images["ai"].startswith("ghcr.io/"):
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

    def test_unhealthy_ai_rolls_back_and_skips_the_same_attempt(self):
        result = self.deploy(FAIL_AI="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.containers(), OLD)
        self.assertFalse((self.root / "deploy-status/server-release.json").exists())
        self.assertEqual(self.deploy().returncode, 0)
        self.assertEqual(self.containers(), OLD)

    def test_rejects_an_image_from_another_registry_before_touching_containers(self):
        result = self.deploy(LABELS=f"{REVISION} example.test/spring@sha256:{'b' * 64} {AI} 123.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.containers(), OLD)
