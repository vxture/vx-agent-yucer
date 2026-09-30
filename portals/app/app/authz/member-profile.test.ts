import { test } from "node:test";
import assert from "node:assert/strict";
import { formatUserNo, memberIdLine, profileChanges } from "./member-profile";

test("the line under a name: phone, else email, else user_no - one only", () => {
  const all = { phone: "+8613800000000", email: "a@example.com", userNo: "1000010000" };
  assert.equal(memberIdLine(all), "138 0000 0000", "a phone shows without +86");
  assert.equal(memberIdLine({ ...all, phone: null }), "a@example.com");
  assert.equal(memberIdLine({ phone: null, email: null, userNo: "1000010000" }), "T-1000010000");
  assert.equal(memberIdLine({}), null, "nothing known is no line - never the sub");
});

test("user_no reads as T- and ten digits; a prefixed value is left as it is", () => {
  assert.equal(formatUserNo("1234567890"), "T-1234567890");
  assert.equal(formatUserNo("T-1234567890"), "T-1234567890");
});

test("a sighting writes only what it supplied and what changed", () => {
  const cached = { displayName: "Alice", phone: "+86138", email: null };
  assert.deepEqual(profileChanges({ workspaceId: "w", sub: "s", displayName: "Alice", phone: "+86138" }, cached), {});
  assert.deepEqual(profileChanges({ workspaceId: "w", sub: "s", phone: null, email: "a@x" }, cached), { phone: null, email: "a@x" });
  // Not supplied (user_no not on the token yet) is not a blank.
  assert.deepEqual(profileChanges({ workspaceId: "w", sub: "s" }, { userNo: "1000010000" }), {});
});
