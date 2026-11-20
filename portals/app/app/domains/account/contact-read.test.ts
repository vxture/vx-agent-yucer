import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAccountStore, type AccountRecord, type ContactRecord } from "./store";
import { contactSummaries, readContactRoster, readContactView } from "./contact-read";
import { permissionsForRoles } from "../../authz/catalog";
import { scopeAccountStore } from "../../authz/scoped-stores";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import type { AccountContext } from "./service";

function fixture() {
  const store = new InMemoryAccountStore();
  const person = (id: string, status: string, accountId = "a", workspaceId = "ws") => ({ id, status, accountId, workspaceId, name: id, title: "Director", department: "Procurement", mobile: "123456789", email: "private@example.test", wechat: "private", sortOrder: 0 } satisfies ContactRecord);
  store.seed({ accounts: ["a", "b"].map(id => ({ id, workspaceId: "ws", name: id, ownerSub: id === "a" ? "rep" : "other" } as AccountRecord)), contacts: [person("left", "left"), person("current", "active"), person("next", "active"), person("other-account", "active", "b"), person("other-workspace", "active", "a", "other")] });
  const ctx: AccountContext = { workspaceId: "ws", sub: "rep", holder: { permissions: new Set(permissionsForRoles(["sales_rep"])) }, entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier: "starter" }, store };
  return { ctx, store, person };
}
test("contact list prefers active contacts in roster order and never sends phone/email channels", async () => {
  const { ctx } = fixture();
  const result = await readContactRoster(ctx, "a"); assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.value.contacts.map(c => c.id), ["current", "next", "left"]);
  const json = JSON.stringify(result.value);
  assert.equal(json.includes("123456789"), false); assert.equal(json.includes("private"), false);
});
test("contact detail requires the same authorized customer relationship and UUID", async () => {
  const { ctx } = fixture();
  const result = await readContactView(ctx, "a", "current"); assert.ok(result.ok);
  if (result.ok) assert.equal(result.value.contact.mobile, "123456789");
  for (const id of ["other-account", "other-workspace", "missing"]) assert.equal((await readContactView(ctx, "a", id)).ok, false);
  assert.equal((await readContactView({ ...ctx, workspaceId: "other" }, "a", "current")).ok, false);
});
test("view-only access can read contacts without graph or write access; missing customer access cannot", async () => {
  const { ctx } = fixture();
  const holder = { permissions: new Set(["account.read"] as const) };
  assert.equal((await readContactRoster({ ...ctx, holder }, "a")).ok, true);
  assert.equal((await readContactView({ ...ctx, holder }, "a", "current")).ok, true);
  assert.equal((await readContactRoster({ ...ctx, holder: { permissions: new Set() } }, "a")).ok, false);
  const restricted = { ...ctx, store: scopeAccountStore(ctx.store, { kind: "own", sub: "rep", accountIds: [] }) };
  assert.equal((await readContactView(restricted, "b", "other-account")).ok, false);
});
test("empty and all-departed rosters retain truthful ordering and state", async () => {
  const { person } = fixture();
  assert.deepEqual(contactSummaries([]), []);
  assert.deepEqual(contactSummaries([person("first", "left"), person("second", "invalid")]).map(c => c.id), ["first", "second"]);
});
