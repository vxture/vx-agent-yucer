import assert from "node:assert/strict";
import { test } from "node:test";
import { isTaskFocus, isTaskPageContext, routePageContext } from "./page-context";

const id = "aa000000-0000-4000-a000-000000000010";
test("page routing distinguishes creation, query-based editing and unrelated search data", () => {
  assert.equal(routePageContext("/segment/new")?.view, "create");
  assert.deepEqual(routePageContext("/catalog/new", `edit=${id}&secret=never-copy`)?.object, { kind: "product", id });
  assert.equal(routePageContext("/catalog/new", `edit=${id}`)?.view, "edit");
  assert.equal(routePageContext("/account/not-an-id")?.object, null);
  assert.equal(routePageContext("/not-registered"), null);
  assert.ok(!JSON.stringify(routePageContext("/account", "search=private-material")).includes("private-material"));
});
test("page and focus metadata refuse scope injection, mismatched objects and raw form contents", () => {
  const page = routePageContext(`/account/${id}`)!;
  assert.ok(isTaskPageContext(page));
  assert.equal(isTaskPageContext({ ...page, workspaceId: "other" }), false);
  assert.equal(isTaskPageContext({ ...page, object: { kind: "strategy", id } }), false);
  assert.equal(isTaskPageContext({ ...page, form: { module: "strategy", fields: ["name"], dirty: true } }), false);
  const form = { ...routePageContext("/strategy/new"), form: { module: "strategy", fields: ["name", "goals"], dirty: true } };
  assert.ok(isTaskPageContext(form));
  assert.equal(isTaskPageContext({ ...form, form: { ...form.form, values: { name: "unverified" } } }), false);
  assert.ok(isTaskFocus({ mode: "none" }));
  assert.ok(isTaskFocus({ mode: "manual", object: page.object }));
  assert.equal(isTaskFocus({ mode: "none", object: page.object }), false);
});
