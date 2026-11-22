#!/usr/bin/env python3
"""Initialize only the registered beta data services; no app, SQL or reset."""

import base64
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import time


ROOT = Path("/srv/md1/yucer")
PROJECT = "yucer-beta"
READER = runpy.run_path(str(Path(__file__).with_name("xiaoyu-beta-supply-readiness.py")))
SERVICES = ("db", "redis")
FORBIDDEN = (
    "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "COMPOSE_FILE",
    "COMPOSE_PROJECT_NAME", "COMPOSE_PROFILES", "COMPOSE_ENV_FILES",
    "COMPOSE_PATH_SEPARATOR", "PATH", "LD_PRELOAD", "PYTHONPATH",
)


def require_scope():
    if os.environ.get("BETA_STACK_ROOT") != str(ROOT) or os.environ.get("BETA_PROJECT_NAME") != PROJECT:
        raise ValueError("beta_scope_refused")
    for path in (ROOT, ROOT / "etc", ROOT / "deploy", ROOT / "data"):
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise ValueError("beta_path_refused")


def decode_configuration(payload):
    if not payload or len(payload) > 90000:
        raise ValueError("beta_configuration_refused")
    decoded = base64.b64decode(payload, validate=True)
    if not decoded or len(decoded) > 65536:
        raise ValueError("beta_configuration_refused")
    with tempfile.TemporaryDirectory(prefix="yucer-beta-validate-") as tmp:
        path = Path(tmp) / "candidate.env"
        path.write_bytes(decoded)
        path.chmod(0o600)
        values = READER["read_env"](path)
    checks = READER["configuration"](values)
    present = all(checks.pop("required_present").values())
    if not present or not all(checks.values()):
        raise ValueError("beta_configuration_refused")
    expected = {
        "PRODUCT_CODE": "yucer", "PROJECT_NAME": PROJECT,
        "NEXT_PUBLIC_APP_ENV": "beta", "DEPLOY_STAGE": "beta",
        "POSTGRES_DB_OWNER": "postgres", "APP_PUBLISH_PORT": "4061",
        "DATA_DIR": str(ROOT / "data"), "APP_ENV_FILE": str(ROOT / "etc/.env"),
    }
    if any(values.get(key) and values[key] != value for key, value in expected.items()):
        raise ValueError("beta_configuration_refused")
    if any(values.get(key) for key in FORBIDDEN):
        raise ValueError("beta_configuration_refused")
    return decoded


def check_existing(path, content):
    if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
        raise ValueError("beta_path_refused")
    if path.exists() and (not path.is_file() or path.read_bytes() != content):
        raise ValueError("beta_existing_file_refused")


def run(command, *, environment=None, timeout=30):
    result = subprocess.run(command, env=environment, capture_output=True,
                            text=True, timeout=timeout, check=False)
    if result.returncode:
        raise ValueError("beta_docker_command_failed")
    return result.stdout


def command_environment():
    # Shell exports must not override the supplied dotenv (especially DB keys).
    environment = {key: os.environ[key] for key in ("PATH", "HOME", "LANG") if key in os.environ}
    environment.update({
        "PROJECT_NAME": PROJECT, "PRODUCT_CODE": "yucer",
        "APP_PUBLISH_PORT": "4061", "POSTGRES_DB_OWNER": "postgres",
        "POSTGRES_DB": "vxturebiz_yucer_beta", "DATA_DIR": str(ROOT / "data"),
        "APP_ENV_FILE": str(ROOT / "etc/.env"),
    })
    return environment


def create_once(path, content, mode):
    if path.exists():
        return False
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(descriptor, "wb") as target:
        target.write(content)
    return True


def read_compose():
    compose_path = Path(__file__).with_name("docker-compose.yml")
    if compose_path.is_symlink() or not compose_path.is_file():
        raise ValueError("beta_compose_refused")
    compose = compose_path.read_bytes()
    if b"name: ${PROJECT_NAME:-yucer}" not in compose or len(compose) > 65536:
        raise ValueError("beta_compose_refused")
    return compose


def check_targets(config, compose):
    check_existing(ROOT / "etc/.env", config)
    check_existing(ROOT / "deploy/docker-compose.yml", compose)
    data = ROOT / "data"
    if data.exists() and (not data.is_dir() or any(data.iterdir())):
        raise ValueError("beta_existing_data_refused")


def check_docker(environment):
    occupied = run([
        "docker", "ps", "--all", "--filter", "name=^/yucer-beta-(app|db|redis)$",
        "--format", "{{.Names}}",
    ], environment=environment)
    if occupied.strip():
        raise ValueError("beta_existing_container_refused")
    networks = run([
        "docker", "network", "ls", "--filter", "name=^yucer-beta-net$", "--format", "{{.Name}}",
    ], environment=environment)
    if networks.strip():
        raise ValueError("beta_existing_network_refused")
    run(["docker", "compose", "version"], environment=environment)


def start_services(environment):
    run([
        "docker", "compose", "--project-name", PROJECT, "--env-file", str(ROOT / "etc/.env"),
        "--file", str(ROOT / "deploy/docker-compose.yml"), "up", "--detach", "--no-deps", *SERVICES,
    ], environment=environment, timeout=180)


def wait_for_data_health(environment):
    for attempt in range(24):
        healthy = all(all(READER["check_container"](PROJECT + "-" + service, environment).values())
                      for service in SERVICES)
        if healthy:
            return
        if attempt < 23:
            time.sleep(5)
    raise ValueError("beta_data_health_unavailable")


def bootstrap(payload):
    require_scope()
    config = decode_configuration(payload)
    compose = read_compose()
    check_targets(config, compose)
    environment = command_environment()
    check_docker(environment)
    for directory in (ROOT, ROOT / "etc", ROOT / "deploy", ROOT / "data"):
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    created_env = create_once(ROOT / "etc/.env", config, 0o600)
    created_compose = create_once(ROOT / "deploy/docker-compose.yml", compose, 0o644)
    start_services(environment)
    wait_for_data_health(environment)
    return {"status": "beta_data_ready", "scope": "beta_only",
            "created_env": created_env, "created_compose": created_compose,
            "started_services": list(SERVICES), "ddl_applied": False,
            "app_deployed": False, "real_user_acceptance": False}


def main():
    try:
        report = bootstrap(sys.stdin.buffer.read(90001))
        print(json.dumps(report, sort_keys=True))
        return 0
    except (ValueError, OSError, subprocess.SubprocessError):
        # Neither config values nor command stderr may leave this process.
        print(json.dumps({"status": "unavailable", "scope": "beta_only",
                          "reason": "beta_data_bootstrap_refused_or_failed",
                          "real_user_acceptance": False}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
