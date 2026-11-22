#!/usr/bin/env python3
"""Run only the fixed reader in the current product container; no DB access."""

import json
import subprocess
import sys


def run(args, data, timeout=40):
    result = subprocess.run(args, input=data, capture_output=True, text=True,
                            timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError("operation_failed")
    return result.stdout


def select_app():
    names = set(run(["docker", "ps", "--format", "{{.Names}}"], None).splitlines())
    found = [name for name in ("yucer-app", "vx-yucer-app-prod") if name in names]
    if len(found) != 1:
        raise RuntimeError("operation_failed")
    return found[0]


def main(script):
    stage = "consumer_selection"
    try:
        app = select_app()
        stage = "consumer_probe"
        module = "const SUPPLY_PRODUCTION=true;\n" + script
        raw = run(["docker", "exec", "-i", app, "node", "--input-type=module", "-"],
                  module, timeout=960)
        report = json.loads(raw)
        # The fixed module projects safe metadata; never relay raw stderr.
        print(json.dumps(report, ensure_ascii=True, indent=2))
        return int(report.get("status") != "ok")
    except (RuntimeError, ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError):
        print(json.dumps({"status": "unavailable", "stage": stage,
                          "reason": "consumer_selection_or_probe_result_invalid"}))
        return 1


if __name__ == "__main__":
    # The workflow embeds the checked-in module; no arbitrary path/input accepted.
    sys.exit(main(SUPPLY_SCRIPT))
