#!/usr/bin/env node
// Guardrail: every place this repo states a port must state the same one.
//
// The platform port registry's rule R3 is "fallback default = registry =
// production container-internal port", and it exists because the failure it
// prevents is silent. The registry records the symptom in its own words: change
// the port and you have to check both places, missing one does not error, and
// it surfaces at runtime as a login that will not redirect back.
//
// This repo cannot check itself against the registry - that page needs a login,
// so neither a coding agent nor CI can read it. What CI CAN do is enforce
// internal agreement, which is the half that actually drifts: the number was
// changed in one file and not the others. Registration itself stays a human
// step, and the pointer in .env.example says where the authority lives.
//
// Rule R2 also applies and is checked: a port must come from an environment
// variable, and code may carry only a FALLBACK default. A hardcoded listen with
// no env override is a defect even when the number is right, because the next
// person to move the port has no way to move it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const strict = process.argv.includes("--strict");

/** Each carrier: where it is, and how to pull the number out of it. */
const CARRIERS = [
  {
    file: "portals/app/package.json",
    label: "dev script fallback",
    re: /"dev"\s*:\s*"next dev -p \$\{PORT:-(\d+)\}"/,
  },
  {
    file: "portals/app/Dockerfile",
    label: "image ENV PORT",
    re: /ENV\s+NODE_ENV=production\s+PORT=(\d+)/,
  },
  {
    file: "portals/app/Dockerfile",
    label: "image EXPOSE",
    re: /^EXPOSE\s+(\d+)/m,
  },
  {
    file: "docker-compose.yml",
    label: "compose PORT",
    re: /^\s*PORT:\s*"(\d+)"/m,
  },
  {
    file: "docker-compose.yml",
    label: "compose published-port fallback",
    re: /\$\{APP_PUBLISH_PORT:-(\d+)\}/,
  },
  {
    file: "docker-compose.yml",
    label: "compose published-port container side",
    re: /\$\{APP_PUBLISH_PORT:-\d+\}:(\d+)/,
  },
  {
    file: "docker-compose.yml",
    label: "compose healthcheck",
    re: /127\.0\.0\.1:(\d+)\/api\/health/,
  },
  {
    file: ".env.example",
    label: "APP_PUBLISH_PORT",
    re: /^APP_PUBLISH_PORT=(\d+)/m,
  },
];

const problems = [];
const found = [];

for (const c of CARRIERS) {
  let text;
  try {
    text = readFileSync(join(repo, c.file), "utf8");
  } catch {
    problems.push(`${c.file} is missing, so ${c.label} cannot be checked`);
    continue;
  }
  const m = c.re.exec(text);
  if (!m) {
    // A carrier that stopped matching is not a pass. It usually means someone
    // rewrote the line in a way this check no longer sees, which is exactly how
    // a guardrail turns into decoration.
    problems.push(`${c.file}: could not find ${c.label} - the check may be stale, or the value was removed`);
    continue;
  }
  found.push({ ...c, port: Number(m[1]) });
}

const ports = [...new Set(found.map((f) => f.port))];
if (ports.length > 1) {
  problems.push(
    `port disagreement across ${found.length} carriers: ` +
      found.map((f) => `${f.file} (${f.label}) = ${f.port}`).join("; "),
  );
}

// R2: the container-internal port must be overridable. A bare literal in the
// CMD or a listen() with no env fallback would pin it.
const dockerfile = (() => {
  try {
    return readFileSync(join(repo, "portals/app/Dockerfile"), "utf8");
  } catch {
    return "";
  }
})();
if (dockerfile && !/ENV\s+[^\n]*PORT=/.test(dockerfile)) {
  problems.push("portals/app/Dockerfile sets no PORT env var, so the port cannot be overridden (rule R2)");
}

if (problems.length > 0) {
  for (const p of problems) console.error(`[port-consistency] ${p}`);
  console.error(
    "[port-consistency] The registry is the authority and lives outside this repo. " +
      "Fix every carrier to the registered number - do not fix the check.",
  );
  process.exit(strict ? 1 : 0);
}

console.log(
  `[port-consistency] OK - ${found.length} carriers agree on ${ports[0]}. ` +
    "Registration itself is a human step against the platform port registry.",
);
