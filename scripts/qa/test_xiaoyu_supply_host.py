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
OTHER = {"tenantId": "33333333-3333-4333-8333-333333333333",
         "workspaceId": "44444444-4444-4444-8444-444444444444"}
NAMES = "yucer-app\nyucer-db\nvx-runos-postgres-db-prod\n"


def rows(*values):
    return "\n".join(json.dumps(value) for value in values)


class HostTests(unittest.TestCase):
    def test_context_must_be_recent_real_and_currently_provisioned(self):
        with patch.object(host, "run", side_effect=[NAMES, rows(OTHER, CONTEXT), rows(CONTEXT)]) as run:
            self.assertEqual(host.select_context(), {**CONTEXT, "source": "recent_success_current_provisioning"})
        for call in run.call_args_list[1:]:
            args, sql = call.args
            self.assertIn("PGOPTIONS=-c default_transaction_read_only=on", args)
            self.assertTrue(sql.startswith("BEGIN READ ONLY;"))
            self.assertIn("statement_timeout='10s'", sql)
            self.assertTrue(sql.endswith("ROLLBACK;\n"))
        self.assertIn("interval '30 days'", run.call_args_list[2].args[1])
        self.assertIn("status='provisioned'", run.call_args_list[1].args[1])

    def test_invalid_context_cannot_enter_sql(self):
        with patch.object(host, "run", side_effect=[NAMES, rows({
                **CONTEXT, "workspaceId": "'; INSERT INTO secret; --"})]) as run:
            with self.assertRaisesRegex(host.ContextError, "no_valid_current_provisioning_context"):
                host.select_context()
            self.assertEqual(run.call_count, 2)
            self.assertNotIn("INSERT", run.call_args.args[1])

    def test_deprovisioned_context_does_not_run_probe(self):
        output = io.StringIO()
        with patch.object(host, "run", side_effect=[NAMES, ""]) as run, \
             contextlib.redirect_stdout(output):
            self.assertEqual(host.main("secret"), 1)
        self.assertEqual(run.call_count, 2)
        report = json.loads(output.getvalue())
        self.assertEqual(report["stage"], "context_verification")
        self.assertEqual(report["reason"], "no_valid_current_provisioning_context")

    def test_raw_command_errors_and_stderr_are_never_printed(self):
        for error in (RuntimeError("secret"), subprocess.TimeoutExpired("secret", 1), ValueError("secret")):
            output = io.StringIO()
            with patch.object(host, "select_context", return_value=CONTEXT), \
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
        with patch.object(host, "select_context", return_value=CONTEXT), \
             patch.object(host, "run", return_value='{"status":"partial","data":{}}') as run, \
             contextlib.redirect_stdout(output):
            self.assertEqual(host.main("module"), 1)
        self.assertEqual(run.call_args.args[0][:4], ["docker", "exec", "-i", "yucer-app"])
        self.assertIn("const SUPPLY_CONTEXT=", run.call_args.args[1])
        self.assertEqual(json.loads(output.getvalue())["status"], "partial")

    def test_no_history_uses_verified_current_context_without_invented_ids(self):
        for history in ("", RuntimeError("secret"), rows({"tenantId": "none", "workspaceId": "sentinel"})):
            info = {}
            with patch.object(host, "run", side_effect=[NAMES, rows(CONTEXT), history]):
                result = host.select_context(info)
            self.assertEqual(result, {**CONTEXT, "source": "current_provisioning_latest"})
            self.assertNotIn("secret", json.dumps(info))

    def test_inactive_or_mismatched_tenant_history_is_never_selected(self):
        history = rows({"tenantId": OTHER["tenantId"], "workspaceId": CONTEXT["workspaceId"]}, OTHER, CONTEXT)
        with patch.object(host, "run", side_effect=[NAMES, rows(CONTEXT), history]):
            self.assertEqual(host.select_context(), {**CONTEXT, "source": "recent_success_current_provisioning"})

    def test_invalid_latest_audit_is_skipped_before_valid_recent_context(self):
        info = {}
        with patch.object(host, "run", side_effect=[NAMES, rows(OTHER, CONTEXT), rows({"tenantId": "none"}, CONTEXT)]):
            self.assertEqual(host.select_context(info)["workspaceId"], CONTEXT["workspaceId"])
        self.assertEqual(info["invalid_audit_contexts"], 1)

    def test_current_provisioning_failure_does_not_fall_back_to_old_audit(self):
        output = io.StringIO()
        with patch.object(host, "run", side_effect=[NAMES, RuntimeError("secret")]) as run, \
             contextlib.redirect_stdout(output):
            self.assertEqual(host.main("probe"), 1)
        self.assertEqual(run.call_count, 2)
        self.assertEqual(json.loads(output.getvalue())["reason"], "current_provisioning_query_failed")
        self.assertNotIn("secret", output.getvalue())

    def test_container_ambiguity_and_unknown_error_details_fail_safely(self):
        with patch.object(host, "run", return_value=NAMES + "vx-yucer-app-prod\n"):
            with self.assertRaisesRegex(host.ContextError, "consumer_container_missing_or_ambiguous"):
                host.select_context()
        output = io.StringIO()
        with patch.object(host, "select_context", side_effect=host.ContextError("secret")), \
             contextlib.redirect_stdout(output):
            self.assertEqual(host.main("probe"), 1)
        self.assertNotIn("secret", output.getvalue())

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
