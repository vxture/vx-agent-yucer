import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addedColumns,
  grantedColumns,
  lateColumnGrants,
} from "../../../scripts/guardrails/check-incr-grants.mjs";

// The late-column half of check-incr-grants.mjs.
//
// WHY THIS FILE EXISTS. That check was written after a real deploy failure -
// 98_column_locks.sql granted `engagement_type`, a column incr/0018 adds, and
// db-init died on `column "engagement_type" of relation "project" does not
// exist`, taking the whole apply down. The check compared BARE COLUMN NAMES on
// both sides, which caught that case and also caught cases that were not cases:
// 98 has granted yucer_gtm.territory.parent_id since baseline, so the day an
// increment added yucer_core.account.parent_id the check reported a
// deploy-killing bug that did not exist.
//
// THE DANGEROUS FIX IS THE ONE THAT JUST STOPS REPORTING. Making a red guard
// green is trivial and usually wrong, so the tests below run in matched pairs:
// every "this must NOT fire" has a sibling "and this still MUST", with the real
// historical failure as one of them. A guard that cries wolf is spent - the
// next person to see it red assumes the same false positive and merges past a
// real one - but a guard that has been quietly defanged is worse.

const LOCKS = `
-- The comment mentions engagement_type and must not count as a grant.
REVOKE UPDATE ON yucer_core.account FROM yucer_svc;
GRANT UPDATE (name, industry, status, updated_at)
  ON yucer_core.account TO yucer_svc;

REVOKE UPDATE ON yucer_gtm.territory FROM yucer_svc;
GRANT UPDATE (name, parent_id, owner_sub, status, updated_at)
  ON yucer_gtm.territory TO yucer_svc;
`;

test("granted columns are table-qualified, not bare names", () => {
  const g = grantedColumns(LOCKS);
  assert.ok(g.has("yucer_gtm.territory.parent_id"));
  assert.ok(g.has("yucer_core.account.name"));
  // The same bare name on the other table is a DIFFERENT column and must not
  // be present just because its name appears somewhere in the file.
  assert.ok(!g.has("yucer_core.account.parent_id"));
});

test("a comment naming a column is not a grant", () => {
  // uncommented() runs first. Without it the header of any increment that
  // explains itself would register as DDL.
  assert.ok(!grantedColumns(LOCKS).has("engagement_type"));
  assert.ok(![...grantedColumns(LOCKS)].some((c) => c.endsWith("engagement_type")));
});

test("one ALTER TABLE adding several columns attributes all of them", () => {
  // incr/0024 uses exactly this form. A parser that took only the first
  // ADD COLUMN per statement would miss mobile and wechat entirely - and
  // missing them means the guard silently stops watching them.
  const sql = `
    ALTER TABLE yucer_core.contact
      ADD COLUMN IF NOT EXISTS email  VARCHAR(255),
      ADD COLUMN IF NOT EXISTS mobile VARCHAR(64),
      ADD COLUMN IF NOT EXISTS wechat VARCHAR(128);
  `;
  const a = addedColumns(sql);
  assert.deepEqual(
    [...a].sort(),
    ["yucer_core.contact.email", "yucer_core.contact.mobile", "yucer_core.contact.wechat"],
  );
});

test("THE FALSE POSITIVE: the same column name on a different table is fine", () => {
  const incr = [
    {
      file: "0025_account_parent.sql",
      sql: `ALTER TABLE yucer_core.account ADD COLUMN IF NOT EXISTS parent_id UUID;`,
    },
  ];
  assert.deepEqual(
    lateColumnGrants(LOCKS, incr),
    [],
    "98 grants territory.parent_id; account.parent_id is a different column",
  );
});

test("THE TRUE POSITIVE still fires: 98 granting a column an increment adds", () => {
  // The real 2026-08-30 failure, reproduced. If this test ever goes green while
  // the one above stays green, the guard has been defanged rather than fixed.
  const locks = `
    REVOKE UPDATE ON yucer_delivery.project FROM yucer_svc;
    GRANT UPDATE (name, engagement_type, status) ON yucer_delivery.project TO yucer_svc;
  `;
  const incr = [
    {
      file: "0018_project_engagement_type.sql",
      sql: `ALTER TABLE yucer_delivery.project
              ADD COLUMN IF NOT EXISTS engagement_type VARCHAR(32) NOT NULL DEFAULT 'one_off';`,
    },
  ];
  const found = lateColumnGrants(locks, incr);
  assert.equal(found.length, 1);
  assert.match(found[0]!, /0018_project_engagement_type\.sql/);
  assert.match(found[0]!, /yucer_delivery\.project\.engagement_type/);
});

test("and it fires on the second column of a multi-column ALTER too", () => {
  // The pair to the multi-column parse above: getting all three columns only
  // matters if the check then actually tests all three.
  const locks = `GRANT UPDATE (name, wechat) ON yucer_core.contact TO yucer_svc;`;
  const incr = [
    {
      file: "0024_x.sql",
      sql: `ALTER TABLE yucer_core.contact
              ADD COLUMN IF NOT EXISTS email VARCHAR(255),
              ADD COLUMN IF NOT EXISTS wechat VARCHAR(128);`,
    },
  ];
  const found = lateColumnGrants(locks, incr);
  assert.equal(found.length, 1);
  assert.match(found[0]!, /yucer_core\.contact\.wechat/);
});

test("the real repository passes - the whole point of the check being green", () => {
  // Reads the actual files rather than fixtures. A unit test over hand-written
  // SQL proves the parser; only this proves the repo.
  const { readFileSync, readdirSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const ROOT = join(import.meta.dirname, "..", "..", "..");
  const INCR = join(ROOT, "deploy/database/ddl/incr");
  const files = readdirSync(INCR).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(files.length > 20, `expected the real increment directory, saw ${files.length} files`);
  const found = lateColumnGrants(
    readFileSync(join(ROOT, "deploy/database/ddl/98_column_locks.sql"), "utf8"),
    files.map((f) => ({ file: f, sql: readFileSync(join(INCR, f), "utf8") })),
  );
  assert.deepEqual(found, []);
});
