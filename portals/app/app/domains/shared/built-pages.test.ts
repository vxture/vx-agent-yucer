import { test } from "node:test";
import assert from "node:assert/strict";
import { missingBuiltPages } from "../../../../../scripts/guardrails/check-built-pages.mjs";

const pages = [
  { route: "/attainment", file: "(app)/attainment/page.tsx" },
  { route: "/attainment/coverage", file: "(app)/attainment/coverage/page.tsx" },
  { route: "/named/[id]", file: "(app)/named/[id]/page.tsx" },
];
const compiled = Object.fromEntries(pages.map(p => [`/${p.file.replace(/\.tsx$/, "")}`, `app/${p.file.replace(/\.tsx$/, ".js")}`]));

test("all reviewed routes must survive source filtering and be in compiled output", () => {
  assert.deepEqual(missingBuiltPages(pages, compiled, () => true), []);
  const filtered = { ...compiled }; delete filtered["/(app)/attainment/coverage/page"];
  assert.deepEqual(missingBuiltPages(pages, filtered, () => true), ["/attainment/coverage"]);
});

test("a manifest entry without the compiled artifact fails instead of reporting a complete image", () => {
  assert.deepEqual(missingBuiltPages(pages, compiled, (artifact: string) => !artifact.includes("/coverage/")), ["/attainment/coverage"]);
});
