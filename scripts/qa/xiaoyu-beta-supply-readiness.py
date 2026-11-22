#!/usr/bin/env python3
"""Fixed beta preflight. Never writes files, starts containers or reads prod."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit


ROOT = Path("/srv/md1/yucer")
PROJECT = "yucer-beta"
REQUIRED = (
    "POSTGRES_PASSWORD", "POSTGRES_DB", "DATABASE_URL", "REDIS_URL",
    "OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI",
    "OIDC_POST_LOGOUT_REDIRECT_URI", "NEXT_PUBLIC_APP_URL", "PLATFORM_API_URL",
    "ATLAS_BASE_URL", "RUNOS_BASE_URL", "PROVISION_WEBHOOK_SECRET",
)


def read_env(path):
    """Read scalar dotenv only; never evaluate shell or expand variables."""
    if path.is_symlink() or path.stat().st_size > 65536:
        raise ValueError("beta_env_refused")
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z_][A-Z0-9_]*", key):
            raise ValueError("beta_env_refused")
        if key in values:
            raise ValueError("beta_env_refused")
        value = value.strip()
        if value.startswith(("'", '"')):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError("beta_env_refused")
            value = value[1:-1]
        else:
            value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
            if value.startswith("#"):
                value = ""
        if "${" in value or "$(" in value or "`" in value:
            raise ValueError("beta_env_refused")
        values[key] = value
    return values


def http_url(value):
    url = urlsplit(value)
    return url.scheme in ("http", "https") and bool(url.hostname) and not url.username and not url.password


def configuration(values):
    database = urlsplit(values.get("DATABASE_URL", ""))
    redis = urlsplit(values.get("REDIS_URL", ""))
    app = values.get("NEXT_PUBLIC_APP_URL", "").rstrip("/")
    return {
        "required_present": {key: bool(values.get(key)) for key in REQUIRED},
        "client_is_beta": values.get("OIDC_CLIENT_ID") == PROJECT,
        "s2s_client_is_beta": values.get("S2S_CLIENT_ID", "") in ("", PROJECT),
        "database_is_beta": database.scheme in ("postgres", "postgresql")
        and database.hostname == PROJECT + "-db"
        and database.path == "/vxturebiz_yucer_beta"
        and database.username == "yucer_svc" and bool(database.password)
        and values.get("POSTGRES_DB") == "vxturebiz_yucer_beta",
        "redis_is_beta": redis.scheme == "redis" and redis.hostname == PROJECT + "-redis",
        "public_origin_is_beta": app == "https://yucer-beta.vxture.com",
        "callback_is_beta": values.get("OIDC_REDIRECT_URI") in (
            app + "/auth/callback", app + "/api/auth/oidc/callback")
        and app == "https://yucer-beta.vxture.com",
        "logout_is_beta": values.get("OIDC_POST_LOGOUT_REDIRECT_URI", "").rstrip("/") == app
        and app == "https://yucer-beta.vxture.com",
        "oidc_enabled": values.get("OIDC_RP_ENABLED") == "on",
        "mock_disabled": values.get("ALLOW_MOCK_ON_DEPLOY") != "on",
        "dev_session_disabled": values.get("YUCER_DEV_SESSION") != "on",
        "demo_data_disabled": values.get("YUCER_DEMO_DATA") != "on",
        "upstream_urls_valid": all(http_url(values.get(key, "")) for key in (
            "OIDC_ISSUER", "PLATFORM_API_URL", "ATLAS_BASE_URL", "RUNOS_BASE_URL")),
    }


def check_container(name, environment=None):
    # The projection excludes Config.Env, mounts, labels other than scope and
    # all raw error text. There is no exec or arbitrary container selector.
    result = subprocess.run(
        ["docker", "inspect", "--type", "container", "--format",
         '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|'
         '{{index .Config.Labels "com.docker.compose.project"}}', name],
        capture_output=True, text=True, timeout=15, check=False, env=environment,
    )
    if result.returncode:
        return {"inspected": False, "healthy": False, "scope_matches": False}
    parts = result.stdout.strip().split("|")
    if len(parts) != 3:
        raise ValueError("beta_container_projection_invalid")
    state, health, project = parts
    return {"inspected": True, "healthy": state == "running" and health == "healthy",
            "scope_matches": project == PROJECT}


def inspect_beta(root=ROOT):
    # Path resolution also rejects any ancestor symlink into a different stack.
    if root.resolve() != ROOT or root.is_symlink():
        raise ValueError("beta_root_refused")
    env_path = root / "etc/.env"
    compose = root / "deploy/docker-compose.yml"
    version = root / "deploy/VERSION"
    for path in (env_path, compose, version):
        if path.resolve().is_relative_to(ROOT) is False:
            raise ValueError("beta_path_refused")
    files = {"env_exists": env_path.is_file(), "compose_exists": compose.is_file(),
             "version_exists": version.is_file()}
    checks = configuration(read_env(env_path)) if files["env_exists"] else None
    containers = {service: check_container(PROJECT + "-" + service)
                  for service in ("app", "db", "redis")}
    config_ready = checks is not None and all(checks["required_present"].values()) \
        and all(value for key, value in checks.items() if key != "required_present")
    ready = all(files.values()) and config_ready \
        and all(all(result.values()) for result in containers.values())
    return {"status": "ready_for_login_check" if ready else "not_ready",
            "scope": "beta_only", "files": files, "configuration": checks,
            "containers": containers, "real_user_acceptance": False}


def main():
    try:
        if os.environ.get("BETA_STACK_ROOT") != str(ROOT) or os.environ.get("BETA_PROJECT_NAME") != PROJECT:
            raise ValueError("beta_scope_refused")
        report = inspect_beta()
        print(json.dumps(report, sort_keys=True))
        return 0
    except (ValueError, OSError, subprocess.SubprocessError):
        print(json.dumps({"status": "unavailable", "scope": "beta_only",
                          "reason": "beta_scope_or_probe_refused", "real_user_acceptance": False}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
