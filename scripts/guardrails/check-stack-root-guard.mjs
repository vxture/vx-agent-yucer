#!/usr/bin/env node
/**
 * check-stack-root-guard.mjs - `deploy/assert-stack-root.sh` must really
 * catch the value it exists to catch.
 *
 * Mirrored from vx-agent-tenderforge's `check_deploy_dir_guard.py` after a
 * real incident there (v0.1.0 deploy, 2026-09-10): STACK_ROOT/DEPLOY_DIR
 * written by Windows Git Bash's MSYS path conversion into
 * `D:/Program Files/Git/srv/md0/x` - a value that is a legal RELATIVE path
 * on Linux, so `mkdir -p`, rsync, the compose-name assertion and the
 * remote's first `cd` all succeed identically, and only a LATER re-resolve
 * of that same relative path fails, far from the cause.
 *
 * THIS GUARDRAIL RUNS THE SCRIPT ITSELF, not a re-typed copy of its rules.
 * A re-typed copy drifts from the real one, and a guardrail testing its own
 * copy stays green after the real script breaks.
 *
 * It also asserts every workflow that builds a path FROM `$STACK_ROOT`
 * actually calls the script first - the script being correct protects
 * nothing at a call site nobody wired it into, and an unwired site fails
 * silently (no symptom until the exact incident recurs there).
 *
 * Modes: default lists violations (exit 0); `--strict` fails hard for CI.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const STRICT = process.argv.includes("--strict");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "deploy", "assert-stack-root.sh");
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");

// The real incident's own value - MSYS's automatic POSIX-arg-to-native-exe
// conversion, mapping "/" to the Git-Bash install root and rewriting the
// rest as a Windows subpath. This case MUST stay in the matrix: it is the
// one value that actually happened, not a hypothetical.
const INCIDENT_VALUE = "D:/Program Files/Git/srv/md0/yucer";

/** [value, expected rejection substring; null means it must PASS]. */
const CASES = [
  ["/srv/md0/yucer", null],
  ["/srv/md1/yucer", null],
  [INCIDENT_VALUE, "冒号"],
  // Backslash built from a char code, not a literal: every layer this file
  // passes through (source, then bash argv) would otherwise eat one
  // escape, and the case would stop testing the byte it claims to.
  ["C:" + String.fromCharCode(92) + "tmp" + String.fromCharCode(92) + "deploy", "反斜杠"],
  ["srv/md0/x", "不是绝对路径"],
  ["/srv/md0/x/", "斜杠结尾"],
  ["", "为空"],
  ["/srv/md0/a:b", "冒号"],
];

function run(value) {
  try {
    const out = execFileSync("bash", [SCRIPT, value], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, output: out };
  } catch (e) {
    return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function findMissingCallSites() {
  const missing = [];
  for (const name of readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml"))) {
    const text = readFileSync(join(WORKFLOWS_DIR, name), "utf8");
    // A "use" is the workflow building a HOST PATH out of STACK_ROOT - the
    // moment the value stops being "a string GitHub gave us" and starts
    // being "something a remote command will cd into". `${{ vars.STACK_ROOT
    // }}` (reading the Environment variable into the step's env) is not
    // that moment; `$STACK_ROOT` interpolated into a shell path is.
    const usesPath = (text.match(/\$\{?STACK_ROOT\}?[^\s"']*\//g) ?? []).length;
    if (usesPath === 0) continue;
    const asserts = (text.match(/assert-stack-root\.sh/g) ?? []).length;
    if (asserts === 0) missing.push(`${name}: builds a path from STACK_ROOT but never calls assert-stack-root.sh`);
  }
  return missing;
}

function main() {
  const problems = [];

  if (!CASES.some(([v]) => v === INCIDENT_VALUE)) {
    problems.push("the real incident's own value is not in the case list at all");
  }

  for (const [value, reason] of CASES) {
    const { code, output } = run(value);
    if (reason === null) {
      if (code !== 0) problems.push(`'${value}' should pass, was rejected: ${output.trim()}`);
      continue;
    }
    if (code === 0) {
      problems.push(`'${value}' should be rejected, but passed`);
    } else if (!output.includes(reason)) {
      problems.push(`'${value}' was rejected, but not for "${reason}" - the message points somewhere else: ${output.trim()}`);
    }
  }

  problems.push(...findMissingCallSites());

  if (problems.length > 0) {
    console.error(`[check-stack-root-guard] ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error("  A value like this is a legal RELATIVE path on Linux - every step up to");
    console.error("  the one that finally fails succeeds identically. This assertion is its");
    console.error("  only error surface.");
    if (STRICT) process.exit(1);
  } else {
    console.log(`[check-stack-root-guard] OK - ${CASES.length} case(s) correct (incl. the real incident's value), all call sites wired.`);
  }
}

main();
