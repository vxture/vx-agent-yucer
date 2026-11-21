import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { inspectBuiltPages, missingBuiltPages } from "../../../../../scripts/guardrails/check-built-pages.mjs";

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

test("build inspection reads the preserved inventory independently of the filtered source tree", () => {
  const repo = mkdtempSync(join(tmpdir(), "yucer-built-pages-"));
  const put = (file: string, value: string) => { const target = join(repo, file); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, value); };
  try {
    put("scripts/guardrails/page-surfaces.json", JSON.stringify({ pages }));
    put("portals/app/.next/server/app-paths-manifest.json", JSON.stringify(compiled));
    for (const artifact of Object.values(compiled)) put(`portals/app/.next/server/${artifact}`, "compiled");
    assert.deepEqual(inspectBuiltPages(repo), { count: 3, missing: [] });
    rmSync(join(repo, "portals/app/.next/server/app/(app)/attainment/coverage"), { recursive: true });
    assert.deepEqual(inspectBuiltPages(repo), { count: 3, missing: ["/attainment/coverage"] });
    rmSync(join(repo, "portals/app/.next/server/app-paths-manifest.json"));
    assert.throws(() => inspectBuiltPages(repo), /ENOENT/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
