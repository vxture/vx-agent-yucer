import { test } from "node:test";
import assert from "node:assert/strict";
import {
  schemasCreated,
  schemasGrantedUsage,
  ungrantedSchemas,
} from "../../../scripts/guardrails/check-incr-grants.mjs";

// The schema half of check-incr-grants.mjs (2026-09-28). incr/0023 created
// local_audit and granted its table but not the schema, and every audit read
// and write in production failed with "permission denied for schema" until
// incr/0095. These pin what the guard recognises.

test("a created schema is found, commented-out statements are not", () => {
  assert.deepEqual([...schemasCreated("CREATE SCHEMA IF NOT EXISTS local_audit;\n-- CREATE SCHEMA ghost;")], ["local_audit"]);
});

test("USAGE grants to the service role are read, including a list", () => {
  assert.deepEqual(
    [...schemasGrantedUsage("GRANT USAGE ON SCHEMA yucer_field, yucer_ref TO yucer_svc;")].sort(),
    ["yucer_field", "yucer_ref"],
  );
  // A table grant is not a schema grant - the exact 0023 shape.
  assert.equal(schemasGrantedUsage("GRANT SELECT, INSERT ON local_audit.event TO yucer_svc;").size, 0);
  // USAGE to somebody else does not let the service role in.
  assert.equal(schemasGrantedUsage("GRANT USAGE ON SCHEMA local_audit TO reporting;").size, 0);
});

test("a later increment may repair an earlier one", () => {
  const created = { file: "0023.sql", sql: "CREATE SCHEMA IF NOT EXISTS local_audit; GRANT SELECT ON local_audit.event TO yucer_svc;" };
  assert.deepEqual(ungrantedSchemas([created]), ["0023.sql creates schema local_audit, but no increment grants USAGE on it"]);
  assert.deepEqual(ungrantedSchemas([created, { file: "0095.sql", sql: "GRANT USAGE ON SCHEMA local_audit TO yucer_svc;" }]), []);
});
