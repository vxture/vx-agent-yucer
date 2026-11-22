"""Beta bootstrap must fail before mutations outside a new, scoped stack."""

import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from test_xiaoyu_beta_supply import complete_env


SOURCE = Path(__file__).with_name("xiaoyu-beta-supply-bootstrap.py")
spec = importlib.util.spec_from_file_location("beta_bootstrap", SOURCE)
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)
COMPOSE = (SOURCE.parents[2] / "docker-compose.yml").read_bytes()


def payload(change=None):
    values = {**complete_env(), **(change or {})}
    return base64.b64encode("\n".join(f"{k}={v}" for k, v in values.items()).encode())


class BetaBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name).resolve()
        self.root = self.directory / "stack"
        self.bundle = self.directory / "bundle"
        self.bundle.mkdir()
        (self.bundle / "docker-compose.yml").write_bytes(COMPOSE)
        self.scope = {"BETA_STACK_ROOT": str(self.root), "BETA_PROJECT_NAME": "yucer-beta"}
        self.patches = [
            patch.object(bootstrap, "ROOT", self.root),
            patch.object(bootstrap, "__file__", str(self.bundle / SOURCE.name)),
            patch.dict(os.environ, self.scope),
            patch.object(bootstrap, "run", return_value=""),
            patch.dict(bootstrap.READER, {"check_container": lambda name, env: {
                "inspected": True, "healthy": True, "scope_matches": True}}),
            patch.object(bootstrap.time, "sleep"),
        ]
        self.mocks = [p.start() for p in self.patches]
        for p in self.patches:
            self.addCleanup(p.stop)

    def test_new_stack_creates_private_config_and_starts_only_data_services(self):
        result = bootstrap.bootstrap(payload())
        self.assertEqual(result["status"], "beta_data_ready")
        self.assertEqual(result["started_services"], ["db", "redis"])
        self.assertFalse(result["ddl_applied"])
        self.assertFalse(result["app_deployed"])
        self.assertFalse(result["real_user_acceptance"])
        self.assertEqual((self.root / "etc/.env").stat().st_mode & 0o777, 0o600)
        self.assertEqual((self.root / "deploy/docker-compose.yml").read_bytes(), COMPOSE)
        commands = self.mocks[3].call_args_list
        self.assertEqual(commands[-1].args[0][-5:], ["up", "--detach", "--no-deps", "db", "redis"])
        self.assertIn("yucer-beta", commands[-1].args[0])
        self.assertEqual(commands[-1].kwargs["environment"]["DATA_DIR"], str(self.root / "data"))
        self.assertNotIn("fixture-secret", json.dumps(result))

    def test_scope_paths_and_existing_payloads_refuse_before_docker_or_stack_writes(self):
        with patch.dict(os.environ, {"BETA_PROJECT_NAME": "yucer"}), self.assertRaises(ValueError):
            bootstrap.bootstrap(payload())
        self.assertFalse(self.root.exists())
        self.root.symlink_to(self.bundle)
        with self.assertRaises(ValueError):
            bootstrap.bootstrap(payload())
        self.root.unlink()
        (self.root / "etc").mkdir(parents=True)
        (self.root / "etc/.env").write_text("existing-private-value")
        with self.assertRaises(ValueError):
            bootstrap.bootstrap(payload())
        self.assertEqual((self.root / "etc/.env").read_text(), "existing-private-value")
        self.mocks[3].assert_not_called()

    def test_all_configuration_boundaries_reject_without_starting_services(self):
        for change in (
            {"OIDC_CLIENT_ID": "yucer"}, {"S2S_CLIENT_ID": "yucer"},
            {"DATABASE_URL": "postgresql://postgres:secret@yucer-db/vxturebiz_yucer_prod"},
            {"DATA_DIR": "/srv/md0/yucer/data"}, {"APP_ENV_FILE": "/other/.env"},
            {"PROJECT_NAME": "yucer"}, {"PRODUCT_CODE": "other"},
            {"NEXT_PUBLIC_APP_ENV": "production"}, {"DEPLOY_STAGE": "production"},
            {"POSTGRES_DB_OWNER": "yucer_svc"}, {"APP_PUBLISH_PORT": "4060"},
            {"COMPOSE_FILE": "/other/compose.yml"}, {"DOCKER_HOST": "tcp://other:2375"},
            {"ALLOW_MOCK_ON_DEPLOY": "on"}, {"YUCER_DEV_SESSION": "on"},
            {"OIDC_CLIENT_SECRET": ""},
        ):
            with self.subTest(change=tuple(change)), self.assertRaises(ValueError):
                bootstrap.bootstrap(payload(change))
        for data in (b"", b"a" * 90001, b"invalid-base64", base64.b64encode(b"A=" + b"a" * 65536)):
            with self.assertRaises(ValueError):
                bootstrap.bootstrap(data)
        self.assertFalse(self.root.exists())
        self.mocks[3].assert_not_called()

    def test_compose_and_data_symlinks_and_nonempty_data_are_never_replaced(self):
        compose = self.bundle / "docker-compose.yml"
        compose.write_text("services: {}")
        with self.assertRaises(ValueError):
            bootstrap.bootstrap(payload())
        compose.unlink()
        compose.symlink_to(SOURCE.parents[2] / "docker-compose.yml")
        with self.assertRaises(ValueError):
            bootstrap.bootstrap(payload())
        compose.unlink()
        compose.write_bytes(COMPOSE)
        (self.root / "data").mkdir(parents=True)
        (self.root / "data/existing").write_text("retained")
        with self.assertRaises(ValueError):
            bootstrap.bootstrap(payload())
        self.assertFalse((self.root / "etc").exists())
        self.assertEqual((self.root / "data/existing").read_text(), "retained")
        self.mocks[3].assert_not_called()

    def test_preexisting_container_refuses_without_target_writes(self):
        self.mocks[3].return_value = "yucer-beta-db\n"
        with self.assertRaises(ValueError):
            bootstrap.bootstrap(payload())
        self.assertFalse(self.root.exists())
        self.assertEqual(self.mocks[3].call_count, 1)

    def test_preexisting_network_is_not_reused(self):
        self.mocks[3].side_effect = ["", "yucer-beta-net\n"]
        with self.assertRaises(ValueError):
            bootstrap.bootstrap(payload())
        self.assertFalse(self.root.exists())
        self.assertEqual(self.mocks[3].call_count, 2)

    def test_existing_identical_files_are_reused_and_create_once_does_not_overwrite(self):
        (self.root / "etc").mkdir(parents=True)
        (self.root / "deploy").mkdir()
        config = base64.b64decode(payload())
        (self.root / "etc/.env").write_bytes(config)
        (self.root / "deploy/docker-compose.yml").write_bytes(COMPOSE)
        result = bootstrap.bootstrap(payload())
        self.assertFalse(result["created_env"])
        self.assertFalse(result["created_compose"])
        path = self.root / "etc/.env"
        self.assertFalse(bootstrap.create_once(path, b"replacement", 0o600))
        self.assertEqual(path.read_bytes(), config)

    def test_host_exports_cannot_override_beta_config_and_command_errors_are_not_relayed(self):
        with patch.dict(os.environ, {"DATABASE_URL": "host-secret", "POSTGRES_PASSWORD": "host-secret",
                                     "DOCKER_HOST": "tcp://other:2375", "COMPOSE_FILE": "/other/file"}):
            env = bootstrap.command_environment()
        for key in ("DATABASE_URL", "POSTGRES_PASSWORD", "DOCKER_HOST", "COMPOSE_FILE"):
            self.assertNotIn(key, env)
        result = subprocess.CompletedProcess([], 1, "fixture-secret", "fixture-secret")
        with patch.object(bootstrap.subprocess, "run", return_value=result), self.assertRaises(ValueError):
            # Stop the per-test mock to exercise the actual subprocess wrapper.
            original = self.patches[3]
            original.stop()
            bootstrap.run(["docker", "compose", "version"])
        success = subprocess.CompletedProcess([], 0, "available", "")
        with patch.object(bootstrap.subprocess, "run", return_value=success) as execute:
            self.assertEqual(bootstrap.run(["docker", "compose", "version"], environment=env), "available")
        self.assertEqual(execute.call_args.kwargs["env"], env)

    def test_health_wait_is_bounded_and_does_not_start_application(self):
        calls = [False, True, True]
        with patch.dict(bootstrap.READER, {"check_container": lambda name, env: {
            "healthy": calls.pop(0), "scope_matches": True}}):
            self.assertEqual(bootstrap.bootstrap(payload())["status"], "beta_data_ready")
        self.mocks[5].assert_called_once_with(5)
        with patch.dict(bootstrap.READER, {"check_container": lambda name, env: {"healthy": False}}):
            with self.assertRaises(ValueError):
                bootstrap.bootstrap(payload())
        self.assertEqual(self.mocks[5].call_count, 24)

    def test_entrypoint_redacts_config_and_tool_errors(self):
        for error in (ValueError("fixture-secret"), OSError("fixture-secret"), subprocess.TimeoutExpired("fixture-secret", 1)):
            output = io.StringIO()
            with patch.object(bootstrap, "bootstrap", side_effect=error), patch.object(bootstrap.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(payload()))), contextlib.redirect_stdout(output):
                self.assertEqual(bootstrap.main(), 1)
            self.assertNotIn("fixture-secret", output.getvalue())
        output = io.StringIO()
        with patch.object(bootstrap, "bootstrap", return_value={"status": "beta_data_ready"}), patch.object(bootstrap.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(payload()))), contextlib.redirect_stdout(output):
            self.assertEqual(bootstrap.main(), 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "beta_data_ready")

    def test_workflow_is_fixed_beta_pinned_main_and_transports_secret_only_over_stdin(self):
        text = (SOURCE.parents[2] / ".github/workflows/xiaoyu-beta-bootstrap.yml").read_text()
        self.assertIn("environment: beta", text)
        self.assertNotIn("environment: production", text)
        self.assertIn('test "$EXPECTED_SHA" = "$ACTUAL_SHA"', text)
        self.assertIn('test "$ACTUAL_REF" = refs/heads/main', text)
        self.assertIn('test "$STACK_ROOT" = /srv/md1/yucer', text)
        self.assertIn('printf \'%s\' "$ENV_FILE_B64" | ssh', text)
        self.assertNotIn("pending_deployments", text)
        self.assertNotIn("workflow_call", text)
        gate = text.split("        run: |\n", 1)[1].split("\n      -", 1)[0]
        valid = dict(os.environ, ACTUAL_REF="refs/heads/main", EXPECTED_SHA="a", ACTUAL_SHA="a", STACK_ROOT="/srv/md1/yucer", PROJECT_NAME="yucer-beta")
        for change, passes in (({}, True), ({"ACTUAL_REF": "refs/heads/feature"}, False), ({"ACTUAL_SHA": "b"}, False), ({"STACK_ROOT": "/srv/md0/yucer"}, False), ({"PROJECT_NAME": "yucer"}, False)):
            result = subprocess.run(["bash", "-c", gate], env={**valid, **change}, capture_output=True, check=False)
            self.assertEqual(result.returncode == 0, passes)


if __name__ == "__main__":
    unittest.main()
