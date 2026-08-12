import { test } from "node:test";
import assert from "node:assert/strict";
import { assertInternalTarget } from "./internal-target";

test("https is allowed to any host", () => {
  assert.ok(assertInternalTarget("https://public.example.com/x"));
  assert.ok(assertInternalTarget("https://platform.internal/x"));
});

test("http is allowed to loopback / private / tailnet hosts", () => {
  for (const u of [
    "http://localhost:3000/x",
    "http://127.0.0.1/x",
    "http://10.1.2.3/x",
    "http://192.168.1.10/x",
    "http://172.16.5.5/x",
    "http://100.64.0.1/x",
    "http://box.ts.net/x",
    "http://svc.internal/x",
  ]) {
    assert.ok(assertInternalTarget(u), u);
  }
});

test("http to a public host is refused (secret must not cross cleartext)", () => {
  assert.throws(() => assertInternalTarget("http://evil.example.com/x"));
  assert.throws(() => assertInternalTarget("http://8.8.8.8/x"));
  assert.throws(() => assertInternalTarget("http://172.32.0.1/x")); // just outside 172.16/12
});
