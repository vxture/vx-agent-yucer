import { test } from "node:test";
import assert from "node:assert/strict";
import { dealWorkspaceHref, resolveDealWorkspace } from "./deal-workspace";

test("existing detail URLs and malformed queries remain on analysis", () => {
  for (const query of [{}, { view: "unknown" }, { view: ["progress", "analysis"] }]) {
    assert.equal(resolveDealWorkspace(query).view, "analysis");
  }
});

test("workbench links resolve each step and reject invalid or repeated steps", () => {
  for (const step of ["plan", "prepare", "feedback", "history"] as const) {
    const href = dealWorkspaceHref("opp_1", "progress", step);
    const query = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    assert.deepEqual(resolveDealWorkspace(query), { view: "progress", step });
  }
  for (const step of ["invalid", ["feedback", "history"]]) {
    assert.deepEqual(resolveDealWorkspace({ view: "progress", step }), { view: "progress", step: "plan" });
  }
});

test("switching views preserves unrelated context and clears stale workspace query values", () => {
  const href = dealWorkspaceHref("opp_1", "progress", "feedback", "period=2026Q4&view=analysis&step=plan&step=history");
  assert.equal(href, "/pipeline/opp_1?period=2026Q4&view=progress&step=feedback");
  assert.equal(dealWorkspaceHref("opp_1", "analysis", "history", href.split("?")[1]), "/pipeline/opp_1?period=2026Q4");
});

test("opportunity identity cannot inject another path, query or fragment", () => {
  assert.equal(dealWorkspaceHref("id/?view=other#evidence", "analysis"), "/pipeline/id%2F%3Fview%3Dother%23evidence");
});
