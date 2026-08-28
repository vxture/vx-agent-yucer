import { test } from "node:test";
import assert from "node:assert/strict";
// The CI script itself, imported the way data-architecture.test.ts imports its
// guardrail: the thing that runs in the pipeline is the thing under test, not a
// copy of its logic.
import { rewriteLcov, run } from "../../../scripts/ci/lcov-to-repo-root.mjs";

const ROOT = "/repo";
const BASE = "portals/app";
const all = () => true;

test("paths inside the workspace become repo-root relative", () => {
  const { text, rewritten } = rewriteLcov("SF:app/domains/x.ts\nDA:1,1\n", {
    root: ROOT,
    base: BASE,
    exists: all,
  });
  assert.match(text, /^SF:portals\/app\/app\/domains\/x\.ts$/m);
  assert.equal(rewritten, 1);
});

test("a path that ESCAPES the workspace resolves, rather than getting a prefix", () => {
  // The two real cases this repo emits, and the whole reason this is a script
  // and not `sed 's#^SF:app/#SF:portals/app/app/#'`. Prefixed, both would keep
  // their `..` segments, match no file, and be dropped from the report without
  // any error - the coverage would simply not be there.
  const { text } = rewriteLcov(
    "SF:../packages/shared/src/brand.ts\nSF:../../scripts/guardrails/check-data-architecture.mjs\n",
    { root: ROOT, base: BASE, exists: all },
  );
  assert.match(text, /^SF:portals\/packages\/shared\/src\/brand\.ts$/m);
  assert.match(text, /^SF:scripts\/guardrails\/check-data-architecture\.mjs$/m);
});

test("a path that resolves to nothing is reported, not written out quietly", () => {
  // The guard that makes the rest safe. A report the scanner cannot match comes
  // back as a NUMBER rather than as a gap, which is where TD-015 started.
  const { missing } = rewriteLcov("SF:app/gone.ts\n", {
    root: ROOT,
    base: BASE,
    exists: () => false,
  });
  assert.deepEqual(missing, ["portals/app/app/gone.ts"]);
});

test("non-SF lines are passed through untouched", () => {
  // lcov is line-oriented and mostly counters; touching anything but SF: would
  // corrupt the record while leaving it parseable.
  const body = "TN:\nFN:3,anonymous_0\nDA:1,1\nBRDA:5,0,0,1\nend_of_record\n";
  const { text, rewritten } = rewriteLcov(body, { root: ROOT, base: BASE, exists: all });
  assert.equal(text, body);
  assert.equal(rewritten, 0);
});

test("the base directory is honoured, not assumed", () => {
  // Same input, different workspace: the transform must follow the argument
  // rather than a hardcoded `portals/app`.
  const { text } = rewriteLcov("SF:src/a.ts\n", {
    root: ROOT,
    base: "portals/packages/shared",
    exists: all,
  });
  assert.match(text, /^SF:portals\/packages\/shared\/src\/a\.ts$/m);
});

// --- The CLI's own decisions -------------------------------------------------
//
// Exercised through `run` rather than by spawning the script. Coverage is
// per-process, so a spawned child would prove the behaviour and report none of
// it - the file would read as covered in CI while these branches were never
// executed by any measured run.

function io(over: Record<string, unknown> = {}) {
  const written: Record<string, string> = {};
  const said: string[] = [];
  return {
    written,
    said,
    cwd: ROOT,
    readFile: () => "SF:app/x.ts\n",
    writeFile: (f: string, text: string) => {
      written[f] = text;
    },
    exists: all,
    log: (m: string) => said.push(m),
    error: (m: string) => said.push(m),
    ...over,
  };
}

test("missing arguments are a usage error, not a crash", () => {
  const i = io();
  assert.equal(run([], i), 2);
  assert.match(i.said[0]!, /usage:/);
  assert.deepEqual(i.written, {}, "and nothing is written");
});

test("a clean report is written and the count reported", () => {
  const i = io();
  assert.equal(run(["cov.info", BASE], i), 0);
  assert.match(i.written["cov.info"]!, /^SF:portals\/app\/app\/x\.ts$/m);
  assert.match(i.said[0]!, /rewrote 1 paths/);
});

test("a report the scanner could not match is REFUSED, and nothing is written", () => {
  // The behaviour the whole script exists for. Writing it anyway would produce
  // a coverage number computed over files Sonar silently ignores.
  const i = io({ exists: () => false });
  assert.equal(run(["cov.info", BASE], i), 1);
  assert.deepEqual(i.written, {});
  assert.match(i.said[0]!, /refusing to write/);
});
