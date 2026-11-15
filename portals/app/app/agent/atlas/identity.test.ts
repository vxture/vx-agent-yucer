import { test } from "node:test";
import assert from "node:assert/strict";
import { modelIdentityReply } from "./identity";

test("model identity uses actual response codes and does not hijack business model questions", () => {
  assert.match(modelIdentityReply("\u4f60\u662f\u54ea\u4e2a\u6a21\u578b", ["served-model"])!, /Atlas.*served-model/);
  assert.match(modelIdentityReply("What model are you?", ["primary", "fallback"])!, /primary \/ fallback/);
  assert.match(modelIdentityReply("What model are you?", [])!, /did not report/);
  assert.equal(modelIdentityReply("\u7528\u4ec0\u4e48\u6a21\u578b\u5206\u6790\u9500\u552e\u6f0f\u6597", ["served-model"]), undefined);
});
