import assert from "node:assert/strict";
import { test } from "node:test";
import { topicsHttp } from "./handler";
const request = (body?: unknown, headers?: HeadersInit) =>
  new Request(
    "http://localhost/api/copilot/topics",
    body === undefined
      ? undefined
      : { method: "POST", headers, body: JSON.stringify(body) },
  );
test("topic HTTP boundary refuses missing identity, cross-site, invalid and oversized bodies without touching private data", async () => {
  for (const op of ["list", "open", "change"] as const)
    assert.equal(
      (
        await topicsHttp(
          request(op === "list" ? undefined : {}),
          op,
          "",
          async () => null,
        )
      ).status,
      403,
    );
  let calls = 0;
  const resolve = async () => {
    calls++;
    return null;
  };
  assert.equal(
    (
      await topicsHttp(
        request({}, { origin: "https://evil.example" }),
        "open",
        "",
        resolve,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await topicsHttp(
        request({ text: "x".repeat(40000) }),
        "open",
        "",
        resolve,
      )
    ).status,
    413,
  );
  assert.equal(calls, 0);
  assert.equal(
    (
      await topicsHttp(
        new Request("http://localhost/api/copilot/topics", {
          method: "POST",
          body: "{",
        }),
        "change",
        "",
        resolve,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await topicsHttp(request(), "list", "", async () => {
        throw Error("store down");
      })
    ).status,
    503,
  );
});
