"""Exercise release transitions with a fake Docker host and health checks."""

import json
import os
from pathlib import Path
import shutil
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
    if "project" in args[2]:
        print("beta")
    elif args[2] == "{{.State.Running}}":
        print("true")
    else:
        print(images[args[-1]])
elif args[0] == "ps":
    print("standby" if "standby" in images else "")
elif args[0] == "exec":
    if args[2] == "printenv":
        print(os.environ.get("SPRING_AI_URL", "http://ai-router:8000") if args[-1] == "AI_BASE_URL" else "d"*64)
    elif args[2] == "curl":
        if "-D" in args:
            standby = Path(".oci-deploy/ai-router/standby")
            target = "standby" if standby.exists() else "primary"
            with Path("routes").open("a") as routes:
                print(target, file=routes)
            print(f"X-Readonme-AI-Route: {target}")
        else:
            print('{"data":true}')
    elif os.getenv("FAIL_STANDBY") and args[1] == "standby":
        sys.exit(2)
    elif os.getenv("FAIL_CANONICAL") and args[1] == "ai" and images["ai"] == os.environ["LABELS"].split()[2]:
        sys.exit(2)
elif args[0] == "rm":
    images.pop(args[-1])
    state.write_text(json.dumps(images))
elif args[0] == "compose":
    if "run" in args:
        images["standby"] = configured_image(args[args.index("run")-1], "ai")
        state.write_text(json.dumps(images))
        print("standby")
    elif "config" in args and "exec" not in args:
        print(configured_image(args[2], args[-1]))
    elif "ps" in args:
        print(args[-1])
    elif "up" in args:
        images[args[-1]] = configured_image(args[args.index("up")-1], args[-1])
        state.write_text(json.dumps(images))
    elif "exec" in args:
        if "psql" in args:
            if "-c" in args:
                assert "RUNNING" in args[-1]
                if os.getenv("DRAIN_READ_FAIL"):
                    sys.exit(1)
                print("t")
            else:
                statement = sys.stdin.read()
                gate = Path("claims-paused")
                if "CREATE OR REPLACE TRIGGER" in statement:
                    gate.touch()
                    with Path("drain-events").open("a") as log:
                        print("pause",file=log)
                elif "DROP TRIGGER" in statement:
                    if os.getenv("FAIL_RESUME"):
                        sys.exit(1)
                    gate.unlink(missing_ok=True)
                    with Path("drain-events").open("a") as log:
                        print("resume",file=log)
                else:
                    sys.exit(1)
        elif "postgres" in args:
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
        self.assertEqual(self.mutations(), [("stop", "backend"), ("stop", "ai"), ("up", "backend"), ("up", "ai")])
        self.assertEqual((self.root / "drain-events").read_text().splitlines(), ["pause", "resume"])

    def test_unhealthy_ai_rolls_back_and_skips_the_same_attempt(self):
        result = self.deploy(FAIL_AI="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.containers(), OLD)
        self.assertEqual((self.root / "drain-events").read_text().splitlines(), ["pause", "resume"])
        self.assertFalse((self.root / "deploy-status/server-release.json").exists())
        self.assertEqual(self.deploy().returncode, 0)
        self.assertEqual(self.containers(), OLD)

    def test_drain_failure_keeps_running_containers_and_reopens_queue(self):
        result = self.deploy(DRAIN_READ_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.mutations(), [])
        self.assertFalse((self.root / "claims-paused").exists())
        self.assertFalse((self.root / ".oci-deploy/in-progress").exists())
        self.assertFalse((self.root / "deploy-status/server-release.json").exists())

    def test_restored_release_retries_reopening_without_switching_images(self):
        failed = self.deploy(FAIL_AI="1", FAIL_RESUME="1")
        self.assertNotEqual(failed.returncode, 0)
        self.assertEqual(self.containers(), OLD)
        self.assertTrue((self.root / "claims-paused").exists())
        self.assertEqual((self.root / ".oci-deploy/in-progress").read_text().strip(), "restored-drained")
        mutations = self.mutations()
        recovery = self.deploy()
        self.assertEqual(recovery.returncode, 0, recovery.stderr)
        self.assertFalse((self.root / "claims-paused").exists())
        self.assertEqual(self.mutations(), mutations)
        self.assertFalse((self.root / "deploy-status/server-release.json").exists())

    def test_interrupted_drain_reopens_old_queue_without_replacing_containers(self):
        state = self.root / ".oci-deploy"
        state.mkdir()
        (state / "in-progress").write_text("draining")
        (state / "last-attempt").write_text("123.1")
        (self.root / "claims-paused").touch()
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / "claims-paused").exists())
        self.assertEqual(self.mutations(), [])

    def test_verified_release_retries_reopening_the_queue_before_publishing(self):
        result = self.deploy(FAIL_RESUME="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((self.root / "claims-paused").exists())
        self.assertFalse((self.root / "deploy-status/server-release.json").exists())
        mutations = self.mutations()
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / "claims-paused").exists())
        self.assertEqual(mutations, self.mutations())
        self.assertTrue((self.root / "deploy-status/server-release.json").exists())

    def mutations(self):
        calls = (json.loads(line) for line in (self.root / "calls.jsonl").read_text().splitlines())
        return [(verb, args[-1]) for args in calls for verb in ("up", "stop") if verb in args]

    def start_with_matching_spring(self):
        old = {"backend": SPRING, "ai": OLD["ai"]}
        (self.root / "containers.json").write_text(json.dumps(old))
        marker = self.root / "deploy-status/server-release.json"
        marker.write_text(json.dumps({"commit": "f" * 40}))
        return old

    def enable_handoff(self):
        self.start_with_matching_spring()
        router = self.root / ".oci-deploy/ai-router"
        router.mkdir(parents=True)
        (router / "enabled").touch()
        shutil.copyfile(SCRIPT.with_name("ai-handoff.sh"), self.root / "ai-handoff.sh")

    def test_unmigrated_spring_does_not_begin_or_consume_the_release_attempt(self):
        self.enable_handoff()
        result = self.deploy(SPRING_AI_URL="http://ai:8000")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.mutations(), [])
        self.assertFalse((self.root / ".oci-deploy/in-progress").exists())
        self.assertFalse((self.root / ".oci-deploy/last-attempt").exists())

    def test_verified_handoff_drains_old_and_returns_to_canonical_ai(self):
        self.enable_handoff()
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "routes").read_text().splitlines(),
                         ["standby", "primary"])
        self.assertEqual(self.containers(), {"backend": SPRING, "ai": AI})
        self.assertEqual(self.mutations(), [("stop", "ai"), ("up", "ai"), ("stop", "standby")])

    def test_refused_standby_never_receives_traffic_or_restarts_canonical_ai(self):
        self.enable_handoff()
        result = self.deploy(FAIL_STANDBY="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "routes").read_text().splitlines(), ["primary"])
        self.assertEqual(self.mutations(), [("stop", "standby")])
        self.assertEqual(self.containers(), {"backend": SPRING, "ai": OLD["ai"]})
        self.assertFalse((self.root / ".oci-deploy/in-progress").exists())

    def test_failed_canonical_returns_to_old_image_while_standby_serves(self):
        self.enable_handoff()
        result = self.deploy(FAIL_CANONICAL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.containers(), {"backend": SPRING, "ai": OLD["ai"]})
        self.assertEqual((self.root / "routes").read_text().splitlines(),
                         ["standby"] * 2 + ["primary"])
        self.assertFalse((self.root / ".oci-deploy/in-progress").exists())

    def test_interrupted_handoff_keeps_standby_serving_during_recovery(self):
        self.enable_handoff()
        state = self.root / ".oci-deploy"
        (state / "last-attempt").write_text("123.1")
        (state / "in-progress").write_text("handoff")
        (state / "ai-router/standby").write_text("beta-ai-standby\n")
        (state / "rollback.yml").write_text(f'services:\n  backend:\n    image: "{SPRING}"\n  ai:\n    image: "{OLD["ai"]}"\n')
        (self.root / "containers.json").write_text(json.dumps({"backend": SPRING, "ai": AI, "standby": AI}))
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.containers(), {"backend": SPRING, "ai": OLD["ai"]})
        self.assertEqual((self.root / "routes").read_text().splitlines(),
                         ["standby", "primary"])
        self.assertFalse((state / "in-progress").exists())

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
