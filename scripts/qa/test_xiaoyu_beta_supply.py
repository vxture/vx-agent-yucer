"""Fixed beta-only readiness, redaction and read-only command boundaries."""

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "beta_readiness", Path(__file__).with_name("xiaoyu-beta-supply-readiness.py"))
beta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(beta)


def complete_env():
    values = {key: "fixture-secret" for key in beta.REQUIRED}
    values.update({
        "POSTGRES_DB": "vxturebiz_yucer_beta",
        "DATABASE_URL": "postgresql://yucer_svc:fixture-secret@yucer-beta-db:5432/vxturebiz_yucer_beta",
        "REDIS_URL": "redis://yucer-beta-redis:6379",
        "OIDC_ISSUER": "https://accounts.example.test",
        "OIDC_CLIENT_ID": "yucer-beta", "OIDC_RP_ENABLED": "on",
        "OIDC_REDIRECT_URI": "https://yucer-beta.vxture.com/api/auth/oidc/callback",
        "OIDC_POST_LOGOUT_REDIRECT_URI": "https://yucer-beta.vxture.com/",
        "NEXT_PUBLIC_APP_URL": "https://yucer-beta.vxture.com",
        "PLATFORM_API_URL": "https://platform.example.test",
        "ATLAS_BASE_URL": "https://atlas.example.test",
        "RUNOS_BASE_URL": "https://runos.example.test",
    })
    return values


class BetaReadinessTests(unittest.TestCase):
    def test_scalar_reader_does_not_evaluate_config_and_handles_comments(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / ".env"
            path.write_text("# comment\nA=plain # inline\nB='a#b'\nC=\"c#d\"\nD= # empty\n\n")
            self.assertEqual(beta.read_env(path), {"A": "plain", "B": "a#b", "C": "c#d", "D": ""})
            for text in ("A=x\nA=y", "export A=x", "A=${OTHER}", "A=$(id)", "A=`id`", "A='unclosed", "x" * 65537):
                path.write_text(text)
                with self.assertRaises(ValueError):
                    beta.read_env(path)
            path.unlink()
            source = Path(tmp) / "source"
            source.write_text("A=value")
            path.symlink_to(source)
            with self.assertRaises(ValueError):
                beta.read_env(path)

    def test_report_projects_presence_and_scope_without_secrets(self):
        report = beta.configuration(complete_env())
        self.assertTrue(all(report["required_present"].values()))
        self.assertTrue(all(v for k, v in report.items() if k != "required_present"))
        self.assertNotIn("fixture-secret", json.dumps(report))
        for change, field in (
            ({"DATABASE_URL": "postgresql://yucer_svc:fixture-secret@yucer-db/vxturebiz_yucer_prod"}, "database_is_beta"),
            ({"OIDC_CLIENT_ID": "yucer"}, "client_is_beta"),
            ({"S2S_CLIENT_ID": "yucer"}, "s2s_client_is_beta"),
            ({"REDIS_URL": "redis://yucer-redis"}, "redis_is_beta"),
            ({"NEXT_PUBLIC_APP_URL": "https://yucer.vxture.com"}, "public_origin_is_beta"),
            ({"OIDC_REDIRECT_URI": "https://yucer.vxture.com/auth/callback"}, "callback_is_beta"),
            ({"OIDC_POST_LOGOUT_REDIRECT_URI": "https://yucer.vxture.com"}, "logout_is_beta"),
            ({"OIDC_RP_ENABLED": "off"}, "oidc_enabled"),
            ({"ALLOW_MOCK_ON_DEPLOY": "on"}, "mock_disabled"),
            ({"YUCER_DEV_SESSION": "on"}, "dev_session_disabled"),
            ({"YUCER_DEMO_DATA": "on"}, "demo_data_disabled"),
            ({"ATLAS_BASE_URL": "not-a-url"}, "upstream_urls_valid"),
            ({"RUNOS_BASE_URL": "https://user:fixture-secret@runos.example.test"}, "upstream_urls_valid"),
        ):
            with self.subTest(field=field):
                self.assertFalse(beta.configuration({**complete_env(), **change})[field])
        self.assertFalse(any(beta.configuration({})["required_present"].values()))

    def test_container_probe_is_projection_only_and_never_relays_command_errors(self):
        result = subprocess.CompletedProcess([], 0, "running|healthy|yucer-beta\n", "fixture-secret")
        with patch.object(beta.subprocess, "run", return_value=result) as run:
            self.assertEqual(beta.check_container("yucer-beta-db"), {
                "inspected": True, "healthy": True, "scope_matches": True})
        args = run.call_args.args[0]
        self.assertEqual(args[:4], ["docker", "inspect", "--type", "container"])
        self.assertEqual(args[-1], "yucer-beta-db")
        self.assertNotIn(".Config.Env", args[5])
        for code, text in ((1, "fixture-secret"), (0, "exited|unhealthy|yucer")):
            result = subprocess.CompletedProcess([], code, text, "fixture-secret")
            with patch.object(beta.subprocess, "run", return_value=result):
                report = beta.check_container("yucer-beta-app")
            self.assertFalse(report["healthy"])
            self.assertFalse(report["scope_matches"])
            self.assertNotIn("fixture-secret", json.dumps(report))
        with patch.object(beta.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "bad", "")):
            with self.assertRaises(ValueError):
                beta.check_container("yucer-beta-app")

    def test_readiness_requires_files_configuration_and_all_healthy_scoped_containers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            with patch.object(beta, "ROOT", root), patch.object(beta, "check_container", return_value={
                "inspected": True, "healthy": True, "scope_matches": True,
            }) as probe:
                absent = beta.inspect_beta(root)
                self.assertEqual(absent["status"], "not_ready")
                self.assertIsNone(absent["configuration"])
                (root / "etc").mkdir()
                (root / "deploy").mkdir()
                (root / "etc/.env").write_text("\n".join(f"{k}={v}" for k, v in complete_env().items()))
                (root / "deploy/docker-compose.yml").write_text("services: {}")
                (root / "deploy/VERSION").write_text("a" * 40)
                self.assertEqual(beta.inspect_beta(root)["status"], "ready_for_login_check")
                self.assertEqual([c.args[0] for c in probe.call_args_list[-3:]], ["yucer-beta-app", "yucer-beta-db", "yucer-beta-redis"])
                with patch.object(beta, "check_container", return_value={"inspected": True, "healthy": False, "scope_matches": True}):
                    self.assertEqual(beta.inspect_beta(root)["status"], "not_ready")
                (root / "etc/.env").write_text("OIDC_CLIENT_ID=yucer")
                self.assertEqual(beta.inspect_beta(root)["status"], "not_ready")

    def test_scope_paths_fail_before_reading_any_other_stack(self):
        with self.assertRaises(ValueError):
            beta.inspect_beta(Path("/srv/md0/yucer"))
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as other:
            root = Path(tmp).resolve()
            (root / "etc").symlink_to(Path(other))
            with patch.object(beta, "ROOT", root), self.assertRaises(ValueError):
                beta.inspect_beta(root)

    def test_entrypoint_redacts_errors_and_requires_beta_environment(self):
        for environment in ({}, {"BETA_STACK_ROOT": "/srv/md0/yucer", "BETA_PROJECT_NAME": "yucer"}):
            output = io.StringIO()
            with patch.dict(os.environ, environment, clear=True), patch.object(beta, "inspect_beta") as inspect, contextlib.redirect_stdout(output):
                self.assertEqual(beta.main(), 1)
            inspect.assert_not_called()
            self.assertEqual(json.loads(output.getvalue())["status"], "unavailable")
        environment = {"BETA_STACK_ROOT": str(beta.ROOT), "BETA_PROJECT_NAME": beta.PROJECT}
        for error in (ValueError("fixture-secret"), OSError("fixture-secret"), subprocess.TimeoutExpired("fixture-secret", 1)):
            output = io.StringIO()
            with patch.dict(os.environ, environment, clear=True), patch.object(beta, "inspect_beta", side_effect=error), contextlib.redirect_stdout(output):
                self.assertEqual(beta.main(), 1)
            self.assertNotIn("fixture-secret", output.getvalue())
        output = io.StringIO()
        with patch.dict(os.environ, environment, clear=True), patch.object(beta, "inspect_beta", return_value={"status": "not_ready"}), contextlib.redirect_stdout(output):
            self.assertEqual(beta.main(), 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "not_ready")

    def test_workflow_is_main_pinned_beta_only_and_has_no_mutation_inputs(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/xiaoyu-beta-check.yml").read_text()
        self.assertIn("environment: beta", workflow)
        self.assertNotIn("environment: production", workflow)
        self.assertNotIn("pending_deployments", workflow)
        gate = workflow.split("        run: |\n", 1)[1].split("\n      -", 1)[0]
        valid = dict(os.environ, ACTUAL_REF="refs/heads/main", EXPECTED_SHA="a", ACTUAL_SHA="a", STACK_ROOT="/srv/md1/yucer", PROJECT_NAME="yucer-beta")
        for change, passes in (({}, True), ({"ACTUAL_REF": "refs/heads/feature"}, False), ({"ACTUAL_SHA": "b"}, False), ({"STACK_ROOT": "/srv/md0/yucer"}, False), ({"PROJECT_NAME": "yucer"}, False)):
            result = subprocess.run(["bash", "-c", gate], env={**valid, **change}, capture_output=True, check=False)
            self.assertEqual(result.returncode == 0, passes)


if __name__ == "__main__":
    unittest.main()
