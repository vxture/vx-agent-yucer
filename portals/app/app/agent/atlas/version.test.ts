import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_ATLAS_VERSION, checkAtlasVersion, parseVersion } from "./version";

test("versions are read with or without the v, and anything else is refused", () => {
  assert.deepEqual(parseVersion("0.7.18"), [0, 7, 18]);
  assert.deepEqual(parseVersion("v0.7.18"), [0, 7, 18]);
  assert.deepEqual(parseVersion("0.8.0-rc.1"), [0, 8, 0]);
  for (const bad of ["", "latest", "0.7", "1.x.3", null, undefined, 7]) assert.equal(parseVersion(bad), null);
});

test("a version below the floor is too old - compared as numbers, not text", () => {
  assert.equal(checkAtlasVersion("0.7.11").kind, "too_old");
  assert.equal(checkAtlasVersion("0.7.17").kind, "too_old");
  assert.equal(checkAtlasVersion("0.7.9", "0.7.18").kind, "too_old");
  assert.equal(checkAtlasVersion("0.6.99").kind, "too_old");
});

test("the floor itself and anything above it pass", () => {
  assert.equal(checkAtlasVersion(MIN_ATLAS_VERSION).kind, "ok");
  assert.equal(checkAtlasVersion("v0.7.18").kind, "ok");
  assert.equal(checkAtlasVersion("0.7.100").kind, "ok", "100 is more than 18");
  assert.equal(checkAtlasVersion("0.8.0").kind, "ok");
  assert.equal(checkAtlasVersion("1.0.0").kind, "ok");
});

test("an unreadable version is unknown, never a failure", () => {
  assert.deepEqual(checkAtlasVersion(undefined), { kind: "unknown" });
  assert.deepEqual(checkAtlasVersion("dev"), { kind: "unknown" });
});
