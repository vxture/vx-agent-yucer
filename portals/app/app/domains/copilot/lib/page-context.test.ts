import assert from "node:assert/strict";
import { test } from "node:test";
import { isTaskFocus, isTaskPageContext, routePageContext } from "./page-context";

const id = "aa000000-0000-4000-a000-000000000010";
test("page routing distinguishes creation, query-based editing and unrelated search data", () => {
  assert.equal(routePageContext("/segment/new")?.view, "create");
  assert.equal(routePageContext("/account/new")?.surface, "/account/new");
  assert.equal(routePageContext("/admin/org/new")?.view, "create");
  assert.ok(isTaskPageContext({...routePageContext("/account"),filters:{query:"customer need",health:"at_risk"}}));
  assert.equal(isTaskPageContext({...routePageContext("/account"),filters:{query:"x".repeat(161)}}),false);
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

test("all reviewed page surfaces declare context without granting native writes",async()=>{
 const {PAGE_SURFACES}=await import("./page-surfaces");assert.equal(PAGE_SURFACES.length,86);
 for(const route of PAGE_SURFACES){const page=routePageContext(route.route.replace(/\[[^\]]+\]/g,id));assert.ok(page,route.route);assert.ok(isTaskPageContext(page),route.route);}
 const filtered=routePageContext("/account","status=active&workspaceId=other&token=secret&sort=name");assert.deepEqual(filtered?.filters,{status:"active",sort:"name"});assert.ok(!JSON.stringify(filtered).includes("secret"));
 assert.equal(isTaskPageContext({...filtered,filters:{token:"secret"}}),false);assert.equal(isTaskPageContext({...filtered,selection:[{kind:"account",id:"bad"}]}),false);
});


test("deployment focus preserves the selected version, evidence and reporting scope without accepting authority", () => {
  const context = routePageContext("/attainment/coverage", `period=2026Q1&scope=territory:${id}&planRevision=${id}&evidence=won&perspective=regions&workspaceId=other`)!;
  assert.deepEqual(context.filters, { period: "2026Q1", scope: `territory:${id}`, planRevision: id, perspective: "regions", evidence: "won" });
  assert.ok(isTaskPageContext(context));
  assert.ok(isTaskPageContext({ ...context, filters: { scope: "owner:U-1234" } }));
  assert.equal(isTaskPageContext({ ...context, filters: { scope: "workspace:other" } }), false);
  assert.equal(isTaskPageContext({ ...context, filters: { planRevision: "current-or-arbitrary" } }), false);
  assert.equal(isTaskPageContext({ ...context, filters: { scope: "territory:a/b" } }), false);
  assert.deepEqual(routePageContext("/winloss", "period=Y2026&status=pending&q=Cloud&outcome=lost&dates=undated")?.filters,
    { status: "pending", period: "Y2026", outcome: "lost", dates: "undated", q: "Cloud" });
});
