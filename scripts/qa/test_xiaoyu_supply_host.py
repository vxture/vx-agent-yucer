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

CONTEXT = {"tenantId": "11111111-1111-4111-8111-111111111111",
           "workspaceId": "22222222-2222-4222-8222-222222222222"}


class HostTests(unittest.TestCase):
    def test_context_must_be_recent_real_and_currently_provisioned(self):
        with patch.object(host, "run", side_effect=[json.dumps(CONTEXT), "1\n"]) as run:
            self.assertEqual(host.select_context(), CONTEXT)
        for call in run.call_args_list:
            args, sql = call.args
            self.assertIn("PGOPTIONS=-c default_transaction_read_only=on", args)
            self.assertTrue(sql.startswith("BEGIN READ ONLY;"))
            self.assertIn("statement_timeout='10s'", sql)
            self.assertTrue(sql.endswith("ROLLBACK;\n"))
        self.assertIn("interval '7 days'", run.call_args_list[0].args[1])
        self.assertIn("status='provisioned'", run.call_args_list[1].args[1])

    def test_invalid_context_cannot_enter_sql(self):
        with patch.object(host, "run", return_value=json.dumps({
                **CONTEXT, "workspaceId": "'; INSERT INTO secret; --"})) as run:
            with self.assertRaises(ValueError):
                host.select_context()
            self.assertEqual(run.call_count, 1)

    def test_deprovisioned_context_does_not_run_probe(self):
        output = io.StringIO()
        with patch.object(host, "run", side_effect=[json.dumps(CONTEXT), "0\n"]) as run, \
             contextlib.redirect_stdout(output):
            self.assertEqual(host.main("secret"), 1)
        self.assertEqual(run.call_count, 2)
        self.assertEqual(json.loads(output.getvalue()), {"status": "unavailable", "stage": "context_verification"})

    def test_raw_command_errors_and_stderr_are_never_printed(self):
        for error in (RuntimeError("secret"), subprocess.TimeoutExpired("secret", 1), ValueError("secret")):
            output = io.StringIO()
            with patch.object(host, "select_context", return_value=CONTEXT), \
                 patch.object(host, "run", side_effect=error), contextlib.redirect_stdout(output):
                self.assertEqual(host.main("module"), 1)
            self.assertNotIn("secret", output.getvalue())

    def test_process_return_error_is_redacted(self):
        result = subprocess.CompletedProcess(["secret"], 1, "secret", "secret")
        with patch.object(host.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "^operation_failed$"):
                host.run(["secret"], "secret")

    def test_partial_report_is_not_completed_and_uses_existing_consumer(self):
        output = io.StringIO()
        with patch.object(host, "select_context", return_value=CONTEXT), \
             patch.object(host, "run", return_value='{"status":"partial","data":{}}') as run, \
             contextlib.redirect_stdout(output):
            self.assertEqual(host.main("module"), 1)
        self.assertEqual(run.call_args.args[0][:4], ["docker", "exec", "-i", "yucer-app"])
        self.assertIn("const SUPPLY_CONTEXT=", run.call_args.args[1])
        self.assertEqual(json.loads(output.getvalue())["status"], "partial")

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
