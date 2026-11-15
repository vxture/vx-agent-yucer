import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareAccountRegistration } from "./registration-service";
import { InMemoryAccountStore } from "./store";
import { InMemoryStrategyStore } from "../strategy/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryAuditStore, setAuditStore } from "../../audit/lib/store";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { REGISTRATION_DRAFT_FIELDS, type RegistrationDraftValues } from "./lib/registration-draft";
import type { AtlasClient, AtlasContext } from "../../agent/atlas/client";
import { AtlasError } from "../../agent/atlas/errors";
import type { RunosClient } from "../../agent/runos/client";

const values = Object.fromEntries(REGISTRATION_DRAFT_FIELDS.map(key => [key, ""])) as RegistrationDraftValues;
function harness() {
  setAuditStore(new InMemoryAuditStore());
  const account = new InMemoryAccountStore();
  const copilot = new InMemoryCopilotStore();
  const ctx = { workspaceId: "ws-registration", sub: "member", store: account,
    holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws-registration", product: "yucer", tier: "enterprise" as const } };
  let calls = 0;
  let charged = 0;
  let reply = JSON.stringify({ message: "Which province?", fields: [{ field: "name", value: "Acme", evidence: "Acme" }] });
  let error: Error | undefined;
  const modelContexts: AtlasContext[] = [];
  const deps = { tenantId: "tenant", locale: "zh-CN", copilotStore: copilot, strategyStore: new InMemoryStrategyStore(),
    atlasClient: { chat: async (_profile: string, req: { tools?: unknown }, context: AtlasContext) => {
      assert.equal(_profile, "drafting");
      modelContexts.push(context);
      calls++; assert.equal(req.tools, undefined);
      if (error) throw error;
      return { id: "chat", modelCode: "fake", message: { role: "assistant", content: reply }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    } } as unknown as AtlasClient,
    runosClient: { discover: async () => { throw new Error("no discovery allowed"); } } as unknown as RunosClient,
    meter: { admit: () => ({ ok: true as const }), record: async () => { charged++; return "metered"; } } };
  return { ctx, deps, account, copilot, modelContexts, calls: () => calls, charged: () => charged, reply: (v: string) => { reply = v; }, error: (e?: Error) => { error = e; } };
}

test("registration uses the shared Atlas profile, identity and metering context for member and service calls", async () => {
  for (const subjectToken of [undefined, "member-access-token"]) {
    const h = harness();
    const result = await prepareAccountRegistration(h.ctx, { text: "Acme", values }, { ...h.deps, subjectToken });
    assert.equal(result.ok, true); if (!result.ok) continue;
    const context = h.modelContexts[0]!;
    assert.equal(context.subjectToken, subjectToken);
    assert.equal(context.workspaceId, h.ctx.workspaceId);
    assert.equal(context.tenantId, h.deps.tenantId);
    assert.equal(context.applicationId, result.sessionId);
    assert.equal(context.featureId, "copilot.chat");
    assert.ok(context.taskId.startsWith(result.sessionId + ":"));
    assert.equal(h.charged(), 1);
    assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 0);
  }
});

test("assistant extracts then follows up in an owned thread, meters each question, and never creates a customer", async () => {
  const h = harness();
  const first = await prepareAccountRegistration(h.ctx, { text: "Acme", values }, h.deps);
  assert.equal(first.ok, true); if (!first.ok) return;
  assert.deepEqual(first.patch, { name: "Acme" });
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 0);
  h.reply(JSON.stringify({ message: "Please review.", fields: [{ field: "province", value: "\u6d59\u6c5f\u7701", evidence: "\u6d59\u6c5f" }] }));
  const next = await prepareAccountRegistration(h.ctx, { text: "\u6d59\u6c5f", values: { ...values, name: "Acme" }, sessionId: first.sessionId }, h.deps);
  assert.equal(next.ok && next.sessionId, first.sessionId);
  const region = (await h.account.listMarketDivisions(h.ctx.workspaceId)).find(r => r.members.some(member => member.key === "\u6d59\u6c5f\u7701"))!;
  assert.deepEqual(next.ok && next.patch, { province: "\u6d59\u6c5f\u7701", region: region.name });
  assert.equal(h.charged(), 2);
  assert.equal((await h.copilot.listMessages(h.ctx.workspaceId, first.sessionId)).length, 4);
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 0);
});

test("gates refuse absent feature, permission and tenant before any model call", async () => {
  const h = harness();
  const noPermission = await prepareAccountRegistration({ ...h.ctx, holder: { permissions: new Set() } }, { text: "Acme", values }, h.deps);
  assert.equal(!noPermission.ok && noPermission.error, "denied");
  const noFeature = await prepareAccountRegistration({ ...h.ctx, entitlement: { ...h.ctx.entitlement, tier: null } }, { text: "Acme", values }, h.deps);
  assert.equal(noFeature.ok, false);
  const noTenant = await prepareAccountRegistration(h.ctx, { text: "Acme", values }, { ...h.deps, tenantId: null });
  assert.equal(!noTenant.ok && noTenant.error, "no_active_tenant");
  assert.equal(h.calls(), 0); assert.equal(h.charged(), 0);
});

test("foreign members, workspaces and ordinary conversation threads cannot be reused", async () => {
  const h = harness();
  for (const thread of [
    await h.copilot.createSession(h.ctx.workspaceId, { subjectType: null, subjectId: null, actorSub: "other", title: "[account-registration] Other" }),
    await h.copilot.createSession("other-workspace", { subjectType: null, subjectId: null, actorSub: h.ctx.sub, title: "[account-registration] Other" }),
    await h.copilot.createSession(h.ctx.workspaceId, { subjectType: null, subjectId: null, actorSub: h.ctx.sub, title: "Ordinary chat" }),
  ]) {
    const r = await prepareAccountRegistration(h.ctx, { text: "Acme", values, sessionId: thread.id }, h.deps);
    assert.equal(!r.ok && r.error, "not_found");
  }
  assert.equal(h.calls(), 0);
});

test("model failure preserves a retryable question; malformed output does not create a customer", async () => {
  const h = harness();
  h.error(new AtlasError({ code: "LOCAL_DEADLINE", status: 504, message: "timed out" }));
  const failed = await prepareAccountRegistration(h.ctx, { text: "Acme", values }, h.deps);
  assert.equal(failed.ok, false); if (failed.ok || !failed.recovery) return assert.fail("retry context missing");
  const recovery = failed.recovery;
  assert.equal((await h.copilot.listMessages(h.ctx.workspaceId, recovery.sessionId)).length, 1);
  h.error(undefined);
  const recovered = await prepareAccountRegistration(h.ctx, { text: "Acme", values, sessionId: recovery.sessionId, retryMessageId: recovery.messageId }, h.deps);
  assert.equal(recovered.ok, true);
  assert.equal((await h.copilot.listMessages(h.ctx.workspaceId, recovery.sessionId)).length, 2);
  h.reply("not JSON");
  const malformed = await prepareAccountRegistration(h.ctx, { text: "Acme", values }, h.deps);
  assert.equal(!malformed.ok && malformed.error, "invalid_draft");
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 0);
});

test("missing only one of the two permissions and malformed or oversized requests fail before charging", async () => {
  const h = harness();
  for (const permission of ["account.write", "copilot.use"] as const) {
    const r = await prepareAccountRegistration({ ...h.ctx, holder: { permissions: new Set([permission]) } }, { text: "Acme", values }, h.deps);
    assert.equal(r.ok, false);
  }
  for (const text of ["", " ", "x".repeat(4001)]) {
    const r = await prepareAccountRegistration(h.ctx, { text, values }, h.deps);
    assert.equal(!r.ok && r.error, "invalid_input");
  }
  assert.equal(h.calls(), 0); assert.equal(h.charged(), 0);
});

test("duplicate hints contain only readable customers in the current workspace", async () => {
  const h = harness();
  const blank = { region: null, province: null, industryId: null, segmentCode: null, customerTypeId: null,
    customerSizeId: null, customerNatureId: null, creditCode: null, website: null, employeeCount: null, ownerSub: h.ctx.sub };
  const own = await h.account.createAccount(h.ctx.workspaceId, { ...blank, name: "Acme Ltd" });
  await h.account.createAccount("other-workspace", { ...blank, name: "Acme Secret" });
  const out = await prepareAccountRegistration(h.ctx, { text: "Acme", values }, h.deps);
  assert.deepEqual(out.ok && out.similar, [{ id: own.id, name: own.name, accountNo: own.accountNo }]);
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 1);
});

test("Atlas extracted relationships resolve to registered customers as a draft without writing", async () => {
  const h = harness();
  const blank = { region:null,province:null,industryId:null,segmentCode:null,customerTypeId:null,customerSizeId:null,customerNatureId:null,creditCode:null,website:null,employeeCount:null,ownerSub:h.ctx.sub };
  const parent = await h.account.createAccount(h.ctx.workspaceId,{...blank,name:"Parent Group"});
  const child = await h.account.createAccount(h.ctx.workspaceId,{...blank,name:"Child Ltd"});
  await h.account.createAccount("another-workspace",{...blank,name:"Foreign Group"});
  const text="Acme belongs to Parent Group; Child Ltd belongs to Acme. Foreign Group is another parent.";
  const relations=[{kind:"parent",name:"Parent Group",evidence:"Parent Group"},{kind:"child",name:"Child Ltd",evidence:"Child Ltd"}];
  h.reply(JSON.stringify({message:"Review the relationships.",fields:[{field:"name",value:"Acme",evidence:"Acme"}],relations}));
  const out=await prepareAccountRegistration(h.ctx,{text,values},h.deps);
  assert.equal(out.ok,true);if(!out.ok)return;
  assert.equal(out.hierarchy.parent?.id,parent.id);
  assert.deepEqual(out.hierarchy.children.map(a=>a.id),[child.id]);
  assert.equal((await h.account.getAccount(h.ctx.workspaceId,child.id))?.parentId,null);
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length,2);
  h.reply(JSON.stringify({message:"Review.",fields:[],relations:[{kind:"parent",name:"Foreign Group",evidence:"Foreign Group"}]}));
  const foreign=await prepareAccountRegistration(h.ctx,{text,values},h.deps);
  assert.equal(foreign.ok&&foreign.hierarchy.proposals[0]?.status,"missing");
  assert.deepEqual(foreign.ok&&foreign.hierarchy.proposals[0]?.candidates,[]);
});

test("registered customer identity retrieves its parent and subsidiaries without proposing duplicate moves",async()=>{
  const h=harness();
  const blank={region:null,province:null,industryId:null,segmentCode:null,customerTypeId:null,customerSizeId:null,customerNatureId:null,creditCode:null,website:null,employeeCount:null,ownerSub:h.ctx.sub};
  const parent=await h.account.createAccount(h.ctx.workspaceId,{...blank,name:"Group"});
  const customer=await h.account.createAccount(h.ctx.workspaceId,{...blank,name:"Acme",parentId:parent.id});
  const child=await h.account.createAccount(h.ctx.workspaceId,{...blank,name:"Subsidiary",parentId:customer.id});
  const out=await prepareAccountRegistration(h.ctx,{text:"Acme",values},h.deps);
  assert.equal(out.ok,true);if(!out.ok)return;
  assert.equal(out.hierarchy.existing?.account.id,customer.id);
  assert.equal(out.hierarchy.existing?.parent?.id,parent.id);
  assert.deepEqual(out.hierarchy.existing?.children.map(a=>a.id),[child.id]);
  assert.deepEqual(out.hierarchy.children,[]);
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length,3);
});
