#!/usr/bin/env python3
"""Fixed operational consumer; credentials stay inside the yucer container."""

import json
import subprocess
import sys
from uuid import UUID


def run(args, data, timeout=40):
    result = subprocess.run(args, input=data, capture_output=True, text=True,
                            timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError("operation_failed")
    return result.stdout


def select_context():
    # Select one recent real consumer context, then verify current provisioning.
    # Never read chats, member identities, business content or an operator token.
    sql = """BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
SELECT json_build_object('tenantId', tenant_id, 'workspaceId', workspace_id)
FROM audit.capability_call WHERE product_id='yucer' AND outcome='success'
AND occurred_at > now() - interval '7 days'
AND tenant_id IS NOT NULL AND workspace_id IS NOT NULL
ORDER BY occurred_at DESC LIMIT 1;
ROLLBACK;
"""
    context = json.loads(run([
        "docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
        "vx-runos-postgres-db-prod", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
        "-U", "postgres", "-d", "vx_runos_db"], sql))
    tenant, workspace = (str(UUID(context[key])) for key in ("tenantId", "workspaceId"))
    verify = f"""BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
SELECT count(*) FROM vx_provision.app_instance
WHERE tenant_id='{tenant}'::uuid AND workspace_id='{workspace}'::uuid
AND product_code='yucer' AND status='provisioned' AND env='prod';
ROLLBACK;
"""
    count = run([
        "docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
        "yucer-db", "sh", "-c",
        'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ], verify).strip()
    if count != "1":
        raise ValueError("context_not_provisioned")
    return {"tenantId": tenant, "workspaceId": workspace}


def main(script):
    stage = "context_verification"
    try:
        context = select_context()
        stage = "consumer_probe"
        module = "const SUPPLY_CONTEXT=" + json.dumps(context) + ";\n" + script
        raw = run(["docker", "exec", "-i", "yucer-app", "node", "--input-type=module", "-"],
                  module, timeout=840)
        report = json.loads(raw)
        # The fixed module projects safe metadata; never relay raw stderr.
        print(json.dumps(report, ensure_ascii=True, indent=2))
        return int(report.get("status") != "ok")
    except (RuntimeError, ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError):
        print(json.dumps({"status": "unavailable", "stage": stage}))
        return 1


if __name__ == "__main__":
    # The workflow embeds the checked-in module; no arbitrary path/input accepted.
    sys.exit(main(SUPPLY_SCRIPT))
