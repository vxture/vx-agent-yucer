"""Exercise real command boundaries without worker02 access or credentials."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "xiaoyu_supply_host", Path(__file__).with_name("xiaoyu-supply-host.py"))
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

class HostTests(unittest.TestCase):
    def test_only_an_unambiguous_running_consumer_can_be_selected(self):
        for name in ("yucer-app", "vx-yucer-app-prod"):
            with patch.object(host, "run", return_value=name + "\nother-container\n"):
                self.assertEqual(host.select_app(), name)
        for names in ("", "yucer-app\nvx-yucer-app-prod\n"):
            with patch.object(host, "run", return_value=names):
                with self.assertRaises(RuntimeError):
                    host.select_app()

    def test_raw_command_errors_and_stderr_are_never_printed(self):
        for error in (RuntimeError("secret"), subprocess.TimeoutExpired("secret", 1), ValueError("secret")):
            output = io.StringIO()
            with patch.object(host, "select_app", return_value="yucer-app"), \
                 patch.object(host, "run", side_effect=error), contextlib.redirect_stdout(output):
                self.assertEqual(host.main("module"), 1)
            self.assertNotIn("secret", output.getvalue())

    def test_process_return_error_is_redacted(self):
        result = subprocess.CompletedProcess(["secret"], 1, "secret", "secret")
        with patch.object(host.subprocess, "run", return_value=result), \
             self.assertRaisesRegex(RuntimeError, "^operation_failed$"):
            host.run(["secret"], "secret")

    def test_partial_report_is_not_completed_and_uses_existing_consumer(self):
        output = io.StringIO()
        with patch.object(host, "select_app", return_value="yucer-app"), \
             patch.object(host, "run", return_value='{"status":"partial","data":{}}') as run, \
             contextlib.redirect_stdout(output):
            self.assertEqual(host.main("module"), 1)
        self.assertEqual(run.call_args.args[0][:4], ["docker", "exec", "-i", "yucer-app"])
        self.assertIn("const SUPPLY_PRODUCTION=true;", run.call_args.args[1])
        self.assertNotIn("psql", run.call_args.args[0])
        self.assertEqual(json.loads(output.getvalue())["status"], "partial")

    def test_failed_inventory_does_not_run_module_or_expose_raw_errors(self):
        output = io.StringIO()
        with patch.object(host, "run", side_effect=RuntimeError("secret")) as run, \
             contextlib.redirect_stdout(output):
            self.assertEqual(host.main("module"), 1)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(json.loads(output.getvalue())["stage"], "consumer_selection")
        self.assertNotIn("secret", output.getvalue())

    def test_platform_context_report_passes_through_without_local_sql(self):
        reply = {"status": "unavailable", "stage": "context_verification",
                 "reason": "no_current_platform_provisioning_context"}
        output = io.StringIO()
        with patch.object(host, "select_app", return_value="vx-yucer-app-prod"), \
             patch.object(host, "run", return_value=json.dumps(reply)) as run, \
             contextlib.redirect_stdout(output):
            self.assertEqual(host.main("module"), 1)
        self.assertEqual(json.loads(output.getvalue()), reply)
        self.assertEqual(run.call_args.args[0][3], "vx-yucer-app-prod")

    def test_actual_workflow_requires_exact_main_and_owner_gate(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github/workflows/xiaoyu-supply-check.yml").read_text()
        self.assertIn("environment: production", workflow)
        self.assertNotIn("pending_deployments", workflow)
        gate = workflow.split("        run: |\n", 1)[1].split("\n      -", 1)[0]
        for ref, expected, actual, passes in (
            ("refs/heads/main", "abc", "abc", True),
            ("refs/heads/main", "abc", "def", False),
            ("refs/heads/feature", "abc", "abc", False),
        ):
            result = subprocess.run(["bash", "-c", gate], capture_output=True,
                env=dict(os.environ, ACTUAL_REF=ref, EXPECTED_SHA=expected, ACTUAL_SHA=actual))
            self.assertEqual(result.returncode == 0, passes)


if __name__ == "__main__":
    unittest.main()
