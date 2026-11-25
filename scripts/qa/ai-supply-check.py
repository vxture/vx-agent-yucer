#!/usr/bin/env python3
"""Fixed, read-only worker02 inventory. Never return raw config or payloads."""

import json
from pathlib import Path
import re
import subprocess
import sys


CONFIG_KEYS = {
    "yucer": ("ATLAS_BASE_URL", "RUNOS_BASE_URL", "S2S_CLIENT_ID",
              "S2S_CLIENT_SECRET", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"),
    "runos": ("RUNOS_CREDENTIAL_VAULT_ENCRYPTION_KEY",),
    "atlas": (),
}

CONNECTORS = """
SELECT json_build_object(
 'capability', c.capability_id, 'provider', c.provider_id,
 'version', v.version, 'state', v.state,
 'operations', (SELECT json_agg(json_build_object(
   'operation', o->>'operation', 'risk', o->>'riskLevel',
   'input_fields', (SELECT json_agg(k) FROM jsonb_object_keys(
     COALESCE(o->'inputSchema'->'properties', '{}'::jsonb)) k)))
   FROM jsonb_array_elements(v.contract->'operations') o),
 'dependencies', (SELECT json_agg(json_build_object(
   'capability', d->>'capabilityId', 'kind', d->>'kind'))
   FROM jsonb_array_elements(v.contract->'dependencies') d),
 'credential_classes', (SELECT json_agg(r->>'credentialClass')
   FROM jsonb_array_elements(v.contract->'credentialRequirements') r),
 'endpoints', (SELECT json_agg(json_build_object('environment', e.environment,
   'state', e.state)) FROM registry.endpoint_instance e
   WHERE e.capability_id=c.capability_id AND e.version=v.version))
FROM registry.capability c JOIN registry.capability_version v USING(capability_id)
WHERE c.primitive_type='connector' ORDER BY c.capability_id, v.version LIMIT 500
"""

RUNOS_QUERIES = {
    "connectors": CONNECTORS,
    "catalog_counts": """SELECT json_build_object('type', primitive_type,
      'count', count(*)) FROM registry.capability GROUP BY primitive_type""",
    "credential_bindings": """SELECT json_build_object('provider', provider_id,
      'credential_class', credential_class, 'mode', mode, 'state', state,
      'count', count(*)) FROM governance.credential_binding
      GROUP BY provider_id, credential_class, mode, state""",
    "yucer_product_grants": """SELECT json_build_object('capability', capability_id,
      'state', state, 'risk_scope', risk_scope, 'type', grant_type)
      FROM governance.capability_grant WHERE subject_ref='yucer'
      ORDER BY capability_id LIMIT 1500""",
    "recent_yucer_calls": """SELECT json_build_object('at', occurred_at,
      'call_id', call_id, 'task_id', task_id, 'capability', capability_id,
      'version', version_resolved, 'operation', operation, 'type', primitive_type,
      'decision', decision, 'outcome', outcome, 'error_code', error_code,
      'bytes_out', bytes_out) FROM audit.capability_call
      WHERE occurred_at > now() - interval '7 days'
        AND (product_id='yucer' OR agent_id='yucer')
      ORDER BY occurred_at DESC LIMIT 100""",
}

ATLAS_QUERIES = {
    "models": """SELECT json_build_object('model', model_code, 'protocol', protocol,
      'active', is_active, 'streaming', supports_streaming,
      'tools_override', config->'wire'->'supports'->'tools',
      'tool_choice_override', config->'wire'->'supports'->'toolChoice')
      FROM model.models WHERE deleted_at IS NULL ORDER BY model_code LIMIT 100""",
    "routes": """SELECT json_build_object('route', code, 'primary', primary_model_code,
      'fallback', fallback_model_code, 'active', is_active)
      FROM model.model_endpoints WHERE deleted_at IS NULL ORDER BY code LIMIT 100""",
    "yucer_route_grants": """SELECT json_build_object('route', endpoint_code,
      'active', is_active, 'expires_at', expires_at)
      FROM model.product_endpoint_grants
      WHERE product_code='yucer' AND deleted_at IS NULL LIMIT 100""",
    "recent_yucer_calls": """SELECT json_build_object('at', created_at,
      'request_id', request_id, 'task_id', task_id, 'route', endpoint_code,
      'model', model_code, 'upstream_model', upstream_model, 'status', status,
      'tools_offered', tool_count, 'tools_called', tool_calls_made,
      'finish_reason', finish_reason, 'input_tokens', input_tokens,
      'output_tokens', output_tokens, 'total_tokens', total_tokens,
      'latency_ms', latency_ms, 'max_tokens', max_tokens)
      FROM reqlog.request_records
      WHERE created_at > now() - interval '7 days' AND product_code='yucer'
      ORDER BY created_at DESC LIMIT 100""",
}

YUCER_QUERIES = {
    "recent_task_turns": """SELECT json_build_object(
      'at', t.created_at, 'turn_id', t.id, 'task_id', t.task_id,
      'request_id', t.request_id, 'status', t.status,
      'error_code', CASE WHEN t.error_key IN ('task_model_failed',
        'task_budget_exhausted', 'source_changed', 'source_unavailable',
        'task_conflict', 'task_source_limit', 'task_tool_denied')
        THEN t.error_key WHEN t.error_key IS NOT NULL THEN 'other' END,
      'elapsed_ms', round(extract(epoch FROM (t.finished_at-t.created_at))*1000),
      'has_answer', t.assistant_message_id IS NOT NULL,
      'source_count', (SELECT count(*) FROM yucer_agent.agent_task_reference r
        WHERE r.task_id=t.task_id),
      'draft_count', (SELECT count(*) FROM yucer_agent.agent_task_draft d
        WHERE d.task_id=t.task_id))
      FROM yucer_agent.agent_task_turn t
      WHERE t.created_at > now() - interval '1 day'
      ORDER BY t.created_at DESC LIMIT 20""",
    "task_schema": """SELECT json_build_object(
      'reference_constraint_current', EXISTS(SELECT 1 FROM pg_constraint
        WHERE conrelid='yucer_agent.agent_task_reference'::regclass
        AND conname='agent_task_reference_object_kind_check'
        AND position('access' in pg_get_constraintdef(oid))>0),
      'reference_insert_granted', has_table_privilege('yucer_svc',
        'yucer_agent.agent_task_reference','INSERT'),
      'artifacts_update_granted', has_column_privilege('yucer_svc',
        'yucer_agent.agent_task_turn','artifacts','UPDATE'))""",
}

# Fixed categories only. Log lines, exception messages, query arguments and
# matched substrings never enter the report. These are window-wide hints, not
# proof that a marker belongs to a particular task.
LOG_MARKERS = {
    "prisma_known_error": r"\bPrismaClientKnownRequestError\b",
    "prisma_validation_error": r"\bPrismaClientValidationError\b",
    "prisma_unknown_error": r"\bPrismaClientUnknownRequestError\b",
    "prisma_transaction_error": r"\bP2028\b",
    "prisma_constraint_error": r"\bP200[0234]\b",
    "transaction_expired": r"Transaction (?:already closed|is no longer valid)|expired transaction",
    "type_error": r"\bTypeError:",
    "missing_response_message": r"Cannot read properties of (?:undefined|null) \(reading 'message'\)",
    "missing_response_usage": r"Cannot (?:read properties of (?:undefined|null) \(reading 'usage'\)|destructure property 'promptTokens')",
    "invalid_json_response": r"Unexpected (?:token|end).*JSON|JSON\.parse",
    "range_error": r"\bRangeError:",
    "syntax_error": r"\bSyntaxError:",
    "database_check_violation": r"violates check constraint",
    "database_unique_violation": r"violates unique constraint",
    "database_foreign_key_violation": r"violates foreign key constraint",
    "database_permission_denied": r"permission denied for (?:table|schema|column)",
    "connection_reset": r"\bECONNRESET\b",
    "connection_refused": r"\bECONNREFUSED\b",
    "fetch_failed": r"\bfetch failed\b",
}


def log_counters(container):
    result = subprocess.run([
        "docker", "logs", "--since", "24h", "--tail", "4000", container,
    ], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        timeout=40, check=False)
    if result.returncode:
        raise RuntimeError("command_failed")
    lines = result.stdout.splitlines()
    return {"window_hours": 24, "line_limit": 4000,
            "possibly_capped": len(lines) >= 4000,
            "counts": {key: sum(bool(re.search(pattern, line, re.IGNORECASE))
                                for line in lines)
                       for key, pattern in LOG_MARKERS.items()}}


def command(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True,
                            timeout=40, check=False)
    if result.returncode:
        # stderr may include a DSN, query or remote response. Never relay it.
        raise RuntimeError("command_failed")
    return result.stdout


def query(container, database, sql):
    statement = ("BEGIN READ ONLY; SET LOCAL statement_timeout='10s';\n"
                 + sql.strip().rstrip(";") + ";\nROLLBACK;\n")
    output = command([
        "docker", "exec", "-i", "-e",
        "PGOPTIONS=-c default_transaction_read_only=on", container,
        "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
        "-d", database,
    ], statement)
    return [json.loads(line) for line in output.splitlines() if line.strip()]


def attempt(operation):
    try:
        return {"status": "ok", "data": operation()}
    except (RuntimeError, subprocess.SubprocessError, OSError, ValueError, KeyError):
        return {"status": "unavailable"}


def app_config(container, product):
    raw = json.loads(command(["docker", "inspect", "--format",
                              "{{json .Config.Env}}", container]))
    env = dict(item.split("=", 1) for item in raw if "=" in item)
    # Values remain in this process; even exception messages are suppressed.
    version, sha = env.get("APP_VERSION", ""), env.get("GIT_SHA", "")
    return {"configured": {key: bool(env.get(key)) for key in CONFIG_KEYS[product]},
            "version": version if re.fullmatch(r"v?\d+\.\d+\.\d+", version) else None,
            "sha": sha if re.fullmatch(r"[a-f0-9]{7,40}", sha) else None}


def inventory():
    names = set(command(["docker", "ps", "--format", "{{.Names}}" ]).splitlines())
    report = {}
    for product in ("yucer", "runos", "atlas"):
        candidates = (f"vx-{product}-app-prod", f"{product}-app")
        app = next((name for name in candidates if name in names), None)
        report[product] = {
            "config_file_present": Path(f"/srv/md0/{product}/etc/.env").is_file(),
            "app": attempt(lambda app=app, product=product: app_config(app, product)) if app else
                   {"status": "container_not_found"},
        }
    for product, queries in (("runos", RUNOS_QUERIES), ("atlas", ATLAS_QUERIES)):
        container = f"vx-{product}-postgres-db-prod"
        for section, sql in queries.items():
            report[product][section] = attempt(
                lambda container=container, product=product, sql=sql: query(container, f"vx_{product}_db", sql))
    for section, sql in YUCER_QUERIES.items():
        report["yucer"][section] = attempt(
            lambda sql=sql: query("yucer-db", "vxturebiz_yucer_prod", sql))
    for section, container in (("app_log_categories", "yucer-app"),
                               ("db_log_categories", "yucer-db")):
        report["yucer"][section] = attempt(lambda container=container: log_counters(container))
    return report


def main():
    report = attempt(inventory)
    print(json.dumps(report, ensure_ascii=True, indent=2))
    if report["status"] != "ok":
        return 1
    return int(any(section.get("status") != "ok"
                   for product in report["data"].values()
                   for section in product.values() if isinstance(section, dict)))


if __name__ == "__main__":
    sys.exit(main())
