#!/usr/bin/env python3
"""Fixed operational consumer; credentials stay inside the yucer container."""

import json
import subprocess
import sys
from uuid import UUID


CONTEXT_CODES = {
    "container_inventory_failed", "consumer_container_missing_or_ambiguous",
    "consumer_database_missing_or_ambiguous", "current_provisioning_query_failed",
    "current_provisioning_result_invalid", "no_valid_current_provisioning_context",
    "recent_audit_query_failed",
}


class ContextError(Exception):
    """Fixed stage codes only; raw subprocess errors never leave this module."""

    def __init__(self, code):
        super().__init__(code if code in CONTEXT_CODES else "context_verification_failed")


def run(args, data, timeout=40):
    result = subprocess.run(args, input=data, capture_output=True, text=True,
                            timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError("operation_failed")
    return result.stdout


def checked_run(args, data, code):
    try:
        return run(args, data)
    except (RuntimeError, OSError, subprocess.SubprocessError):
        raise ContextError(code) from None


def select_container(names, candidates, code):
    found = [name for name in candidates if name in names]
    if len(found) != 1:
        raise ContextError(code)
    return found[0]


def identity(row):
    try:
        return {key: str(UUID(row[key])) for key in ("tenantId", "workspaceId")}
    except (ValueError, KeyError, TypeError, AttributeError):
        return None


def current_contexts(database):
    provision_sql = """BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
SELECT json_build_object('tenantId', tenant_id, 'workspaceId', workspace_id)
FROM vx_provision.app_instance
WHERE product_code='yucer' AND status='provisioned' AND env='prod'
AND tenant_id IS NOT NULL ORDER BY updated_at DESC, workspace_id LIMIT 100;
ROLLBACK;
"""
    raw = checked_run([
        "docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
        database, "sh", "-c",
        'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:?}"',
    ], provision_sql, "current_provisioning_query_failed")
    try:
        active = [identity(json.loads(line)) for line in raw.splitlines() if line.strip()]
    except (ValueError, TypeError):
        raise ContextError("current_provisioning_result_invalid") from None
    if not active or any(row is None for row in active):
        raise ContextError("no_valid_current_provisioning_context")
    return active


def recent_context(names, active, info):
    info["recent_audit"] = "unavailable"
    if "vx-runos-postgres-db-prod" not in names:
        return None
    history_sql = """BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
SELECT json_build_object('tenantId', tenant_id, 'workspaceId', workspace_id)
FROM audit.capability_call WHERE product_id='yucer' AND outcome='success'
AND occurred_at > now() - interval '30 days'
AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL
ORDER BY occurred_at DESC LIMIT 100;
ROLLBACK;
"""
    try:
        raw = checked_run([
            "docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
            "vx-runos-postgres-db-prod", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
            "-U", "postgres", "-d", "vx_runos_db"], history_sql, "recent_audit_query_failed")
        recent = [identity(json.loads(line)) for line in raw.splitlines() if line.strip()]
    except (ContextError, ValueError, TypeError):
        # Audit is not an authority for the consumer's current workspace.
        return None
    info["recent_audit"] = "available"
    info["invalid_audit_contexts"] = sum(row is None for row in recent)
    return next((row for row in recent if row is not None and row in active), None)


def select_context(diagnostics=None):
    # Current consumer provisioning is authoritative. Past platform audit is
    # only a preference; no-history and sentinel IDs must not block discovery.
    info = diagnostics if diagnostics is not None else {}
    names = set(checked_run(["docker", "ps", "--format", "{{.Names}}"], None,
                            "container_inventory_failed").splitlines())
    app = select_container(names, ("yucer-app", "vx-yucer-app-prod"),
                           "consumer_container_missing_or_ambiguous")
    database = select_container(names, ("yucer-db", "vx-yucer-postgres-db-prod"),
                                "consumer_database_missing_or_ambiguous")
    active = current_contexts(database)
    info["current_candidates_returned"] = len(active)
    info["candidate_limit"] = 100
    match = recent_context(names, active, info)
    context = match or active[0]
    source = "recent_success_current_provisioning" if match else "current_provisioning_latest"
    info["selection"] = source
    info["consumer_container"] = app
    return {**context, "source": source}


def main(script):
    stage = "context_verification"
    diagnostics = {}
    try:
        context = select_context(diagnostics)
        stage = "consumer_probe"
        module = "const SUPPLY_CONTEXT=" + json.dumps(context) + ";\n" + script
        raw = run(["docker", "exec", "-i", diagnostics.get("consumer_container", "yucer-app"), "node", "--input-type=module", "-"],
                  module, timeout=840)
        report = json.loads(raw)
        report["context_verification"] = diagnostics
        # The fixed module projects safe metadata; never relay raw stderr.
        print(json.dumps(report, ensure_ascii=True, indent=2))
        return int(report.get("status") != "ok")
    except ContextError as error:
        print(json.dumps({"status": "unavailable", "stage": stage,
                          "reason": str(error), "context_verification": diagnostics}))
        return 1
    except (RuntimeError, ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError):
        print(json.dumps({"status": "unavailable", "stage": stage,
                          "reason": "context_or_probe_result_invalid",
                          "context_verification": diagnostics}))
        return 1


if __name__ == "__main__":
    # The workflow embeds the checked-in module; no arbitrary path/input accepted.
    sys.exit(main(SUPPLY_SCRIPT))
