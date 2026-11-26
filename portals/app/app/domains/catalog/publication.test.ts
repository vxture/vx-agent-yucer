import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCatalogStore, type ProductInput } from "./store";

function store() {
  const s = new InMemoryCatalogStore();
  s.seed({ statuses: ["active", "in_development", "retired"].map(statusCode => ({
    id: statusCode, workspaceId: "ws", statusCode, name: statusCode, description: null, sortOrder: 0,
  })) });
  return s;
}
const product = { productCode: "PRD-PUB", name: "Product", typeId: null, unitId: "unit", statusId: "in_development" };
const solution = { solutionCode: "SOL-PUB", name: "Solution", summary: null, scenario: null, status: "active" as const };

test("new product records its first sale, preserving it through edit and reactivation", async () => {
  const s = store();
  const draft = await s.upsertProduct("ws", product, "create");
  assert.equal(draft.firstPublishedAt, null);
  assert.equal(await s.setProductStatus("other", draft.id, "active"), null);
  const published = await s.setProductStatus("ws", draft.id, "active");
  assert.ok(published?.firstPublishedAt instanceof Date);
  await s.setProductStatus("ws", draft.id, "retired");
  const restored = await s.setProductStatus("ws", draft.id, "active");
  assert.deepEqual(restored?.firstPublishedAt, published.firstPublishedAt);
  const edited = await s.upsertProduct("ws", { ...product, statusId: "active", name: "Revised" }, { editId: draft.id });
  assert.deepEqual(edited.firstPublishedAt, published.firstPublishedAt);
});

test("publication is not a supplied field and new active solutions publish once", async () => {
  const s = store();
  const forged = { ...product, statusId: "active", firstPublishedAt: new Date("2000-01-01") } as ProductInput;
  const p = await s.upsertProduct("ws", forged, "create");
  assert.ok(p.firstPublishedAt && p.firstPublishedAt.getFullYear() > 2000);
  const first = await s.upsertSolution("ws", solution, [], "create");
  assert.ok(first.firstPublishedAt instanceof Date);
  await s.upsertSolution("ws", { ...solution, status: "retired" }, [], { editId: first.id });
  const restored = await s.upsertSolution("ws", solution, [], { editId: first.id });
  assert.deepEqual(restored.firstPublishedAt, first.firstPublishedAt);
});

test("legacy product and solution publication stays unknown after reactivation", async () => {
  const s = store();
  s.seed({ products: [{ ...product, id: "old-product", workspaceId: "ws", sortOrder: 0, statusId: "retired" }],
    solutions: [{ ...solution, id: "old-solution", workspaceId: "ws", sortOrder: 0, status: "retired" }] });
  assert.equal((await s.setProductStatus("ws", "old-product", "active"))?.firstPublishedAt ?? null, null);
  const restored = await s.upsertSolution("ws", solution, [], { editId: "old-solution" });
  assert.equal(restored.firstPublishedAt, null);
  const inactive = await s.upsertSolution("ws", { ...solution, solutionCode: "SOL-NEW", status: "retired" }, [], "create");
  assert.equal(inactive.firstPublishedAt, null);
  const active = await s.upsertSolution("ws", { ...solution, solutionCode: "SOL-NEW" }, [], { editId: inactive.id });
  assert.ok(active.firstPublishedAt instanceof Date);
});
