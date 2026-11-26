import assert from "node:assert/strict";
import { test } from "node:test";
import { judgementRecordHref } from "./record-link";

test("findings open their scoped subject: account, opportunity or team planning", () => {
  assert.equal(judgementRecordHref({subjectType:"account",subjectId:"account-a"}), "/account/account-a");
  assert.equal(judgementRecordHref({subjectType:"opportunity",subjectId:"deal-a"}), "/pipeline/deal-a");
  assert.equal(judgementRecordHref({subjectType:"team",subjectId:"team-a"}), "/planning");
  for (const subjectId of ["", "..", "../admin", "https://example.com", "x?scope=all", "x#other"]) {
    assert.equal(judgementRecordHref({subjectType:"account",subjectId}), "/copilot/today");
  }
});
