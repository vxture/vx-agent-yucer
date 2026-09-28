import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIEFING_KINDS, canonicalJson, inputFingerprint, runIdOf } from "./briefing";

const run = (input: unknown) => ({
  capability: "account.consistency",
  kind: "consistency_check" as const,
  subjectType: "account" as const,
  subjectId: "acc_1",
  input,
});

test("canonical JSON sorts keys at every depth and keeps array order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, 1], c: null } }), '{"a":{"c":null,"d":[2,1]},"b":1}');
  assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
});

test("the same input is one fingerprint however its keys were written; any change is another", () => {
  const a = inputFingerprint(run({ question: "q", notes: [{ id: "n1", text: "x" }] }));
  const b = inputFingerprint(run({ notes: [{ text: "x", id: "n1" }], question: "q" }));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, inputFingerprint(run({ question: "q", notes: [{ id: "n1", text: "y" }] })));
  assert.notEqual(a, inputFingerprint({ ...run({ question: "q", notes: [{ id: "n1", text: "x" }] }), subjectId: "acc_2" }));
});

test("the run id is the fingerprint shaped as a UUID - deterministic, never random", () => {
  const f = inputFingerprint(run({ q: 1 }));
  assert.equal(runIdOf(f), runIdOf(f));
  assert.match(runIdOf(f), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("BRIEFING_KINDS is exactly the database's chk_agent_briefing_kind - the latest increment that restates it", async () => {
  // A kind added here but not to the CHECK is refused by Postgres at the first
  // write - after the model was already called and charged. Mirror, both ways.
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "../../deploy/database/ddl/incr");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let latest: string | null = null;
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    const m = /ADD CONSTRAINT chk_agent_briefing_kind CHECK \(kind IN \(([^)]*)\)\)/.exec(sql);
    if (m) latest = m[1]!;
  }
  assert.ok(latest, "no increment restates chk_agent_briefing_kind");
  const inDb = [...latest.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(inDb, [...BRIEFING_KINDS].sort());
});
