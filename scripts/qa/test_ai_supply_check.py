"""Exercise diagnostic failure/redaction boundaries without host credentials."""

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
    "ai_supply_check", Path(__file__).with_name("ai-supply-check.py"))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class SupplyCheckTests(unittest.TestCase):
    def test_raw_credentials_and_invalid_identity_values_are_not_returned(self):
        raw = ["ATLAS_BASE_URL=https://user:secret@example.com?token=secret",
               "S2S_CLIENT_SECRET=secret", "UNRELATED_SECRET=secret",
               "APP_VERSION=secret", "GIT_SHA=secret"]
        with patch.object(check, "command", return_value=json.dumps(raw)):
            result = check.app_config("yucer-app", "yucer")
        self.assertNotIn("secret", json.dumps(result))
        self.assertTrue(result["configured"]["ATLAS_BASE_URL"])
        self.assertTrue(result["configured"]["S2S_CLIENT_SECRET"])
        self.assertFalse(result["configured"]["RUNOS_BASE_URL"])

    def test_driver_is_read_only_and_only_decodes_json_rows(self):
        with patch.object(check, "command", return_value='{"count": 1}\n') as run:
            self.assertEqual(check.query("db", "test", "SELECT 1"), [{"count": 1}])
        args, statement = run.call_args.args
        self.assertIn("PGOPTIONS=-c default_transaction_read_only=on", args)
        self.assertIn("ON_ERROR_STOP=1", args)
        self.assertIn("-X", args)
        self.assertTrue(statement.startswith("BEGIN READ ONLY;"))
        self.assertIn("SET LOCAL statement_timeout='10s';", statement)
        self.assertTrue(statement.endswith("ROLLBACK;\n"))

    def test_process_errors_never_echo_stderr_or_command(self):
        result = subprocess.CompletedProcess(["secret"], 1, "secret", "secret")
        with patch.object(check.subprocess, "run", return_value=result):
            output = check.attempt(lambda: check.command(["secret"]))
        self.assertEqual(output, {"status": "unavailable"})

    def test_log_categories_never_return_lines_or_error_payloads(self):
        raw = ("TypeError: private-dialogue password=secret\n"
               "PrismaClientKnownRequestError code P2028 private-query\n"
               "new row violates check constraint private-business\n")
        result = subprocess.CompletedProcess([], 0, raw)
        with patch.object(check.subprocess, "run", return_value=result) as run:
            output = check.log_counters("yucer-app")
        self.assertEqual(output["counts"]["type_error"], 1)
        self.assertEqual(output["counts"]["prisma_transaction_error"], 1)
        self.assertEqual(output["counts"]["database_check_violation"], 1)
        self.assertFalse(output["possibly_capped"])
        for sensitive in ("private", "secret", "password", "P2028"):
            self.assertNotIn(sensitive, json.dumps(output))
        args = run.call_args.args[0]
        self.assertEqual(args, ["docker", "logs", "--since", "24h", "--tail", "4000", "yucer-app"])

    def test_log_failure_or_timeout_does_not_echo_raw_output(self):
        result = subprocess.CompletedProcess([], 1, "secret")
        with patch.object(check.subprocess, "run", return_value=result):
            self.assertEqual(check.attempt(lambda: check.log_counters("app")), {"status": "unavailable"})
        with patch.object(check.subprocess, "run", side_effect=subprocess.TimeoutExpired("secret", 40)):
            self.assertEqual(check.attempt(lambda: check.log_counters("app")), {"status": "unavailable"})

    def test_database_input_categories_distinguish_types_without_values(self):
        raw = ('ERROR: invalid input syntax for type uuid: "private-secret"\n'
               'ERROR: invalid input syntax for type json\n'
               'DETAIL: Unicode low surrogate must follow a high surrogate. private-secret\n'
               'ERROR: invalid input syntax for type integer: "private-secret"\n'
               'ERROR: invalid input value for enum private_type: "private-secret"\n'
               'ERROR: unsupported Unicode escape sequence\n'
               'DETAIL: \\u0000 cannot be converted to text. private-secret\n')
        result = subprocess.CompletedProcess([], 0, raw)
        with patch.object(check.subprocess, "run", return_value=result):
            output = check.log_counters("yucer-db")
        for category in ("database_invalid_uuid", "database_invalid_json",
                         "database_invalid_number", "database_invalid_enum",
                         "database_untranslatable_null"):
            self.assertEqual(output["counts"][category], 1)
        self.assertEqual(output["counts"]["database_invalid_unicode"], 2)
        for sensitive in ("private", "secret", "DETAIL", "ERROR", "\\u0000"):
            self.assertNotIn(sensitive, json.dumps(output))
    def test_metadata_queries_do_not_select_private_content(self):
        statements = " ".join(check.YUCER_QUERIES.values())
        for forbidden in ("actor_sub", "workspace_id", "question_hash", "content", "goal", "artifacts"):
            self.assertNotIn("t." + forbidden, statements)
        self.assertIn("LIMIT 20", statements)
        atlas = check.ATLAS_QUERIES["recent_yucer_calls"]
        for required in ("input_tokens", "output_tokens", "total_tokens", "latency_ms", "max_tokens"):
            self.assertIn(required, atlas)
        self.assertNotIn("error_message", atlas)

    def test_timeouts_and_bad_json_are_redacted(self):
        for error in (subprocess.TimeoutExpired("secret", 40, output="secret"),
                      ValueError("secret")):
            with patch.object(check, "command", side_effect=error):
                output = check.attempt(lambda: check.app_config("app", "atlas"))
            self.assertEqual(output, {"status": "unavailable"})

    def test_one_database_failure_does_not_hide_other_sections(self):
        names = "yucer-app\nvx-runos-app-prod\nvx-atlas-app-prod\n"
        with patch.object(check, "command", return_value=names), \
             patch.object(check, "app_config", return_value={"configured": {}}), \
             patch.object(check, "query", side_effect=RuntimeError("secret")):
            result = check.inventory()
        self.assertEqual(result["yucer"]["app"]["status"], "ok")
        for product in ("runos", "atlas"):
            self.assertEqual(result[product]["recent_yucer_calls"]["status"], "unavailable")
        self.assertNotIn("secret", json.dumps(result))

    def test_missing_docker_fails_without_raw_exception(self):
        output = io.StringIO()
        with patch.object(check, "command", side_effect=FileNotFoundError("secret")), \
             contextlib.redirect_stdout(output):
            code = check.main()
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(output.getvalue()), {"status": "unavailable"})

    def test_partial_result_fails_instead_of_claiming_complete(self):
        output = io.StringIO()
        with patch.object(check, "inventory", return_value={
            "runos": {"connectors": {"status": "unavailable"}}}), \
             contextlib.redirect_stdout(output):
            self.assertEqual(check.main(), 1)

    def test_successful_main_returns_safe_report(self):
        output = io.StringIO()
        with patch.object(check, "inventory", return_value={
            "runos": {"connectors": {"status": "ok", "data": []}}}), \
             contextlib.redirect_stdout(output):
            self.assertEqual(check.main(), 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "ok")

    def test_actual_workflow_pin_step_accepts_only_exact_main(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / ".github/workflows/ai-supply-check.yml").read_text()
        gate = workflow.split("        run: |\n", 1)[1].split("\n      -", 1)[0]
        for ref, expected, actual, passes in (
            ("refs/heads/main", "abc", "abc", True),
            ("refs/heads/main", "abc", "def", False),
            ("refs/heads/feature", "abc", "abc", False),
            ("refs/tags/v1.0.0", "abc", "abc", False),
        ):
            env = dict(os.environ, ACTUAL_REF=ref, EXPECTED_SHA=expected,
                       ACTUAL_SHA=actual)
            result = subprocess.run(["bash", "-c", gate], env=env, capture_output=True)
            self.assertEqual(result.returncode == 0, passes)


if __name__ == "__main__":
    unittest.main()
