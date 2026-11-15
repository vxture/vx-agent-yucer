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
      calls++; if (req.tools) assert.deepEqual((req.tools as { name: string }[]).map(tool => tool.name), ["find_capabilities", "load_capability"]);
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

test("a model identity question reports the actual Atlas model rather than an invented model identity", async () => {
  const h = harness();
  h.reply(JSON.stringify({ message: "I cannot answer identity questions.", fields: [] }));
  const result = await prepareAccountRegistration(h.ctx, { text: "\u4f60\u662f\u54ea\u4e2a\u6a21\u578b", values }, h.deps);
  assert.equal(result.ok, true);
  assert.match(result.ok ? result.message : "", /Atlas.*fake/);
  assert.deepEqual(result.ok && result.patch, {});
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 0);
});

test("company research flows through Atlas and Runos into a cited draft while preserving sales decisions", async () => {
  const h = harness();
  let calls = 0;
  const runosContexts: { taskId: string; workspaceId: string }[] = [];
  const text = "Acme \u6218\u7565\u7ea7\uff0c\u76ee\u6807 100\u4e07\uff0c\u5176\u4ed6\u4fe1\u606f\u5e2e\u6211\u67e5\u8be2\u8865\u9f50";
  const website = "https://acme.example/about";
  const final = JSON.stringify({ message: "Found the official profile. Please review.", fields: [
    { field: "name", value: "Acme", evidence: "Acme" },
    { field: "tier", value: "strategic", evidence: "\u6218\u7565\u7ea7" },
    { field: "targetAmount", value: "1000000", evidence: "100\u4e07" },
    { field: "website", value: website, evidence: website, sourceId: "read-1-1", sourceUrl: website },
    { field: "province", value: "\u6d59\u6c5f\u7701", evidence: "\u6d59\u6c5f\u7701", sourceId: "read-1-1", sourceUrl: website },
    { field: "period", value: "2027Q1", evidence: "2027Q1", sourceId: "read-1-1" },
  ] });
  const result = await prepareAccountRegistration(h.ctx, { text, values: { ...values, period: "2026Q4" } }, { ...h.deps,
    atlasClient: { chat: async (_profile: string, request: { tools?: { name: string; parameters: unknown }[] }, context: AtlasContext) => {
      h.modelContexts.push(context);
      if (++calls === 1) assert.deepEqual(request.tools?.[0]?.parameters, { type: "object", properties: { query: { type: "string" } }, required: ["query"] });
      return { id: "research", modelCode: "served-model", message: calls === 1
        ? { role: "assistant", content: "", toolCalls: [{ id: "lookup", name: "company__lookup", arguments: { query: "Acme" } }] }
        : { role: "assistant", content: final }, usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 } };
    } } as unknown as AtlasClient,
    runosClient: {
      discover: async (_args: unknown, context: { taskId: string; workspaceId: string }) => { runosContexts.push(context); return [{ capability_id: "company", primitive_type: "connector", operations: [{ operation: "lookup", risk_level: "read", interaction_mode: "sync", description: "Company public profile" }] }]; },
      resolve: async () => ({ capability_id: "company", primitive_type: "connector", state: "stable", version: "1.0.0", contract: { operations: [{ operation: "lookup", riskLevel: "read", interactionMode: "sync", description: "Company public profile", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }] } }),
      invoke: async (_args: unknown, context: { taskId: string; workspaceId: string }) => { runosContexts.push(context); return { structured: { website, province: "\u6d59\u6c5f\u7701", period: "2027Q1" }, content: [], meta: { call_id: "lookup", version_resolved: "1.0.0" } }; },
    } as unknown as RunosClient,
  });
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.patch.name, "Acme");
  assert.equal(result.patch.targetAmount, "1000000");
  assert.equal(result.patch.tier, "strategic");
  assert.equal(result.patch.website, website);
  assert.equal(result.patch.province, "\u6d59\u6c5f\u7701");
  assert.equal(result.patch.period, undefined);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0]?.url, website);
  assert.equal(calls, 3);
  assert.ok(runosContexts.every(context => context.taskId === h.modelContexts[0]?.taskId && context.workspaceId === h.ctx.workspaceId));
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 0);
  assert.equal((await h.copilot.listProposals(h.ctx.workspaceId)).length, 0);
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

test("identity omissions get one Atlas correction; later turns reuse the validated public evidence", async () => {
  const h = harness();
  const name = "\u56db\u5ddd\u7701\u536b\u661f\u5e94\u7528\u6280\u672f\u4e2d\u5fc3";
  const legal = `\u56db\u5ddd\u7701\u56fd\u571f\u79d1\u5b66\u6280\u672f\u7814\u7a76\u9662\uff08${name}\uff09`;
  const text = `${name} 100\u4eba\uff0c\u91cd\u8981\u7ea7\uff0c\u76ee\u6807\u989d20\u4e07`;
  const website = "www.sclandcloud.org.cn";
  const report = `${legal}\n125100004507196291\n${website}\n\u56db\u5ddd\u7701\u6210\u90fd\u5e02\n140\u540d\u5de5\u4f5c\u4eba\u5458`;
  let calls = 0, invocations = 0;
  let later = false, priorSource = "";
  const contexts: AtlasContext[] = [];
  const rows = (sourceId: string) => [
    { field: "name", value: legal, evidence: legal, sourceId },
    { field: "creditCode", value: "125100004507196291", evidence: "125100004507196291", sourceId },
    { field: "website", value: website, evidence: website, sourceId },
    { field: "province", value: "\u56db\u5ddd\u7701", evidence: "\u56db\u5ddd\u7701\u6210\u90fd\u5e02", sourceId },
    { field: "employeeCount", value: 140, evidence: "140\u540d\u5de5\u4f5c\u4eba\u5458", sourceId },
  ];
  const response = (content: string) => ({ id: "draft", modelCode: "served", message: { role: "assistant", content }, usage: { totalTokens: 3 } });
  const deps = { ...h.deps, atlasClient: { chat: async (_profile: string, request: Parameters<AtlasClient["chat"]>[1], context: AtlasContext) => {
    calls++; contexts.push(context);
    if (later) {
      assert.ok(request.messages.some(message => /Previously verified read results/.test(message.content)));
      assert.ok(request.messages.filter(message => message.role === "assistant").every(message => !message.content.includes("_registrationReadEvidence")));
      return response(JSON.stringify({ message: "Filled", fields: rows(priorSource) }));
    }
    if (calls === 1) return { ...response(""), message: { role: "assistant", content: "", toolCalls: [{ id: "lookup", name: "public__lookup", arguments: { query: name } }] } };
    if (calls === 2) return response(JSON.stringify({ message: "\u57fa\u7840\u8d44\u6599\u5df2\u5168\u90e8\u586b\u5199\u5e76\u4fdd\u5b58", fields: [
      { field: "employeeCount", value: 100, evidence: "100\u4eba" }, { field: "tier", value: "key", evidence: "\u91cd\u8981\u7ea7" }, { field: "targetAmount", value: "200000", evidence: "20\u4e07" },
    ] }));
    assert.equal(request.tools, undefined);
    assert.match(request.messages.at(-1)!.content, /Still empty: name, website, province, creditCode/);
    return response(JSON.stringify({ message: "All set", fields: rows("read-1-1") }));
  } } as unknown as AtlasClient, runosClient: {
    discover: async () => [{ capability_id: "public", primitive_type: "connector", operations: [{ operation: "lookup", risk_level: "read", interaction_mode: "sync" }] }],
    resolve: async () => ({ capability_id: "public", primitive_type: "connector", state: "stable", version: "1.0.0", contract: { operations: [{ operation: "lookup", riskLevel: "read", interactionMode: "sync", inputSchema: { type: "object" } }] } }),
    invoke: async () => { invocations++; return { structured: { status: "ok" }, content: [{ type: "text", text: report }], meta: { result_kind: "executed", call_id: "public-fixture", version_resolved: "1.0.0" } }; },
  } as unknown as RunosClient };
  const result = await prepareAccountRegistration(h.ctx, { text, values }, deps);
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.patch.name, legal.normalize("NFKC"));
  assert.equal(result.patch.website, `https://${website}/`);
  assert.equal(result.patch.creditCode, "125100004507196291");
  assert.equal(result.patch.province, "\u56db\u5ddd\u7701");
  assert.equal(result.patch.employeeCount, "100");
  assert.equal(result.patch.tier, "key"); assert.equal(result.patch.targetAmount, "200000");
  assert.equal(result.suggestions[0]?.value, "140");
  assert.equal(calls, 3); assert.equal(invocations, 1); assert.equal(h.charged(), 1);
  assert.ok(contexts.every(context => context.taskId === contexts[0]?.taskId));
  assert.doesNotMatch(result.message, /\u5df2\u5168\u90e8\u586b\u5199\u5e76\u4fdd\u5b58/);
  const { previousRegistrationEvidence } = await import("./lib/registration-feedback");
  const prior = previousRegistrationEvidence(await h.copilot.listMessages(h.ctx.workspaceId, result.sessionId));
  priorSource = prior.find(source => source.content.includes(website) && source.content.includes("125100004507196291"))!.id;
  later = true;
  const next = await prepareAccountRegistration(h.ctx, { text: "\u57fa\u7840\u8d44\u6599\u6ca1\u6709\u586b\u5199", sessionId: result.sessionId, values: { ...values, employeeCount: "100" } }, deps);
  assert.equal(next.ok, true); if (!next.ok) return;
  assert.equal(next.patch.creditCode, "125100004507196291");
  assert.equal(next.patch.website, `https://${website}/`);
  assert.equal(next.suggestions[0]?.currentValue, "100");
  assert.equal(invocations, 1);
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 0);
});
