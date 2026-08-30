import { test } from "node:test";
import assert from "node:assert/strict";
import { menuFor } from "./board-menu";
import type { BoardSection } from "./board";

const s = (
  key: string,
  domain: string | null,
  isMap = false,
): BoardSection => ({ key, title: key, href: "/x", domain, metrics: [], ...(isMap ? { isMap } : {}) });

const SECTIONS = [
  s("queue", null),
  s("resource", "position"),
  s("allies", "position"),
  s("quota", "deployment"),
  s("map-armory", "armory", true),
  s("map-position", "position", true),
];

test("inside a domain the menu is that domain's own, plus the crosscutting card", () => {
  assert.deepEqual(
    menuFor(SECTIONS, "/pipeline").map((x) => x.key),
    ["queue", "resource", "allies"],
  );
});

test("the map disappears once you are inside a section", () => {
  // Its whole job was getting you there. Keeping it would put the choice you
  // already made back in front of you on every page of the product.
  assert.equal(
    menuFor(SECTIONS, "/pipeline").some((x) => x.isMap),
    false,
  );
});

test("outside any domain the menu IS the map", () => {
  assert.deepEqual(
    menuFor(SECTIONS, "/").map((x) => x.key),
    ["queue", "map-armory", "map-position"],
  );
});

test("a domain HOME is inside its domain, not outside", () => {
  // The regression shape that already bit once: the first path segment is the
  // literal "domain" there, so a lookup by key reads it as nowhere.
  assert.deepEqual(
    menuFor(SECTIONS, "/domain/position").map((x) => x.key),
    ["queue", "resource", "allies"],
  );
});

test("another domain's cards never leak into this menu", () => {
  assert.equal(
    menuFor(SECTIONS, "/pipeline").some((x) => x.domain === "deployment"),
    false,
  );
  assert.deepEqual(
    menuFor(SECTIONS, "/planning").map((x) => x.key),
    ["queue", "quota"],
  );
});
