import { test } from "node:test";
import assert from "node:assert/strict";
import { ATLAS_CONTRACT_FINGERPRINT, contractDrift } from "./contract";

test("the live fingerprint is compared with the pin; a missing one is unreadable, not 'same'", () => {
  assert.deepEqual(contractDrift({ fingerprint: ATLAS_CONTRACT_FINGERPRINT }), { kind: "same" });
  assert.deepEqual(contractDrift({ fingerprint: "c1-000000000000" }), { kind: "moved", live: "c1-000000000000" });
  assert.deepEqual(contractDrift({}), { kind: "unreadable" });
  assert.deepEqual(contractDrift(null), { kind: "unreadable" });
});
