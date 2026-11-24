import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import type { AtlasClient } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import type { ChatResponse } from "../../agent/atlas/types";
import { FIND_CAPABILITIES, LOAD_CAPABILITY, toolNameFor } from "../../agent/orchestrator/tools";
import type { DiscoveredCapability } from "../../agent/runos/types";
import { unwrap } from "../shared/result";
import { InMemoryTaskStore } from "./task-store";
import { InMemoryCopilotStore } from "./store";
import {
  createPrivateTask,
  runPrivateTaskTurn,
  changePrivateTask,
  readPrivateTask,
  type TaskContext,
} from "./task-service";
import {
  mergeForm,
  readBusinessForm,
  fieldsFor,
  formHref,
} from "./lib/business-form";
import type { TaskSource } from "./lib/task-contract";
const WS = randomUUID(),
  ACCESS = randomUUID(),
  SEG = randomUUID();
async function setup(question = "create a segment") {
  const store = new InMemoryTaskStore(),
    sessions = new InMemoryCopilotStore();
  const access: TaskSource = {
      kind: "access",
      id: ACCESS,
      version: "permissions-v1",
    },
    source: TaskSource = { kind: "segment", id: SEG, version: "market-v1" };
  const sources = new Map<string, TaskSource>([
    [ACCESS, access],
    [SEG, source],
  ]);
  const c: TaskContext = {
    workspaceId: WS,
    sub: "alice",
    holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: WS,
      product: "yucer",
      tier: "enterprise",
    },
    store,
    sessions,
    source: async (o) => sources.get(o.id) ?? null,
    refresh: async () => c,
    business: {
      access,
      query: async () => ({
        records: [{ id: SEG, name: "GIS" }],
        sources: [access, source],
        limited: false,
        recordState: "current",
      }),
      prepare: async (form) => ({ ...form, sources: [access] }),
    },
  };
  let messages: Partial<ChatResponse["message"]>[] = [];
  let after: () => void = () => {};
  const prompts: string[] = [],
    profiles: string[] = [];
  let discoveries = 0;
  const deps = {
    tenantId: "tenant",
    atlasClient: {
      async chat(
        profile: string,
        request: { messages: { content?: string }[] },
      ) {
        profiles.push(profile);
        prompts.push(JSON.stringify(request));
        const message = messages.shift() ?? {
          content: "Draft ready for review",
        };
        after();
        return {
          id: randomUUID(),
          message: { role: "assistant", ...message },
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    } as unknown as AtlasClient,
    runosClient: { discover: async () => { discoveries++; return []; } } as unknown as RunosClient,
    meter: {
      admit: () => ({ ok: true as const }),
      record: async () => "charge",
    },
  };
  const task = unwrap(
    await createPrivateTask(c, {
      requestId: randomUUID(),
      goal: question,
      targets: [],
    }),
  );
  const turn = async () => {
    const b = await store.load(
      { workspaceId: WS, actorSub: "alice" },
      task.id,
      true,
    );
    return runPrivateTaskTurn(
      c,
      task.id,
      {
        requestId: randomUUID(),
        revision: b!.task.revision,
        question,
      },
      deps,
    );
  };
  const tools = (name: string, args: unknown) => ({
    toolCalls: [{ id: randomUUID(), name, arguments: JSON.stringify(args) }],
  });
  return {
    c,
    store,
    task,
    deps,
    sources,
    prompts,
    profiles,
    discoveryCount: () => discoveries,
    turn,
    tools,
    set: (next: typeof messages) => {
      messages = next;
    },
    after: (f: () => void) => {
      after = f;
    },
  };
}
test("a compound first question reads Runos evidence and prepares a bound native draft within one budget", async () => {
  const question = "Read https://example.org/market, then create a segment draft for human review. " +
    "Use explicit assumptions, do not save or publish. ".repeat(10).trimEnd();
  const f = await setup(question);
  const capabilityId = "example.public-research";
  const schema = { type: "object", properties: { url: { type: "string", format: "uri" } }, required: ["url"] };
  const capabilities: DiscoveredCapability[] = Array.from({ length: 20 }, (_, i) => ({
    capability_id: i === 0 ? capabilityId : `example.connector-${i}`,
    title: `Research connector ${i}`, primitive_type: "connector", provider: "example", admission_tier: "official",
    summary: "Read open market statistics and company reports. ".repeat(10),
    use_when: "Choose when retrieving currently published information. ".repeat(10),
    avoid_when: "Ignore unverified sources and paywalled materials. ".repeat(10),
    operations: [{ operation: "fetch", description: "Fetch a page", interaction_mode: "sync", risk_level: "read" }],
  }));
  const steps: string[] = [];
  f.deps.runosClient.discoverPage = async () => { steps.push("find"); return { capabilities, total: 20 }; };
  f.deps.runosClient.resolve = async (id) => {
    assert.equal(id, capabilityId);
    steps.push("load");
    return { capability_id: id, title: "Public research", state: "stable", version: "1.0.1", primitive_type: "connector", provider: "example", contract: {
      summary: "Retrieve official statistics", useWhen: "Read a named public page", avoidWhen: "Do not use for internal records",
      operations: [{ operation: "fetch", description: "Read URL", riskLevel: "read", interactionMode: "sync", inputSchema: schema, outputSchema: {}, idempotent: true }],
    } };
  };
  f.deps.runosClient.invoke = async (args) => {
    assert.deepEqual(args, { capability_id: capabilityId, operation: "fetch", arguments: { url: "https://example.org/market" }, version: "1.0.1" });
    steps.push("fetch");
    const content = [{ type: "text", text: "Source: https://example.org/market\nPublished permit records. " + "Public reference paragraph. ".repeat(600) }];
    return { content, structured: { content }, meta: { call_id: "fetch-1", version_resolved: "1.0.1" } };
  };
  f.set([
    f.tools(FIND_CAPABILITIES, { query: "fetch public webpage", primitive_type: "connector" }),
    f.tools(LOAD_CAPABILITY, { capability_id: capabilityId }),
    f.tools(toolNameFor(capabilityId, "fetch"), { url: "https://example.org/market" }),
    f.tools("business_form_contract", { module: "segment" }),
    f.tools("prepare_business_form", { module: "segment", key: "market", fields: { name: "Permit software users", priority: 1, criteria: { customerNeed: "Hypothesis: easier permit lookup." } } }),
    { content: "Study excerpt read [read-3-1]. Private draft ready for review." },
  ]);
  const chat = f.deps.atlasClient.chat.bind(f.deps.atlasClient);
  f.deps.atlasClient.chat = async (profile, request, context) => {
    // Local gateway stand-in approximates serialized request sizes; the real
    // tokenizer and routing remain part of the owner-reviewed live acceptance.
    const promptTokens = Math.ceil(Buffer.byteLength(JSON.stringify({ messages: request.messages, tools: request.tools })) / 3) + 400;
    return { ...await chat(profile, request, context), usage: { promptTokens, completionTokens: 100, totalTokens: promptTokens + 100 } };
  };
  const result = unwrap(await f.turn());
  const b = unwrap(await readPrivateTask(f.c, f.task.id));
  assert.equal(b.task.goal, question);
  assert.deepEqual(steps, ["find", "load", "fetch"]);
  assert.equal(f.discoveryCount(), 0);
  assert.equal("navigation" in result ? result.navigation : undefined, `/copilot?task=${f.task.id}&form=market`);
  assert.equal(b.drafts.length, 1);
  assert.equal(readBusinessForm(b.drafts[0]!.text).fields.name, "Permit software users");
  assert.deepEqual(b.turns[0]!.artifacts!.research[0]!.links, ["https://example.org/market"]);
  const usage = b.turns[0]!.artifacts!.usage;
  assert.ok(usage.totalTokens < 40000);
  assert.equal(usage.modelUsage!.length, 6);
  assert.equal(usage.modelUsage!.reduce((sum, row) => sum + row.totalTokens, 0), usage.totalTokens);
  assert.equal(usage.modelUsage![0]!.toolResultTokens, 0);
  assert.ok(usage.modelUsage![3]!.toolResultTokens > usage.modelUsage![2]!.toolResultTokens);
  assert.equal(b.capabilities.save, false);
  assert.equal(b.capabilities.publish, false);
  const first = JSON.parse(f.prompts[0]!);
  assert.equal(first.messages.at(-1).content, question);
  assert.ok(!first.messages[0].content.includes(question.trim()));
  const read = JSON.parse(f.prompts[2]!);
  assert.deepEqual(read.tools.find((t: {name: string}) => t.name === toolNameFor(capabilityId, "fetch")).parameters, schema);
});

test("research prepares and opens a sourced private form; human corrections survive the next model turn", async () => {
  const f = await setup();
  f.set([
    f.tools("query_business", { kind: "segment" }),
    f.tools("business_form_contract", { module: "segment" }),
    f.tools("prepare_business_form", {
      module: "segment",
      key: "market",
      fields: {
        name: "GIS pilot",
        priority: 1,
        status: "active",
        criteria: {
          industries: [],
          regions: [],
          sizes: [],
          needSummary: "Agent-assisted mapping",
        },
      },
    }),
    f.tools("open_business_page", { module: "segment", create: true }),
    { content: "successfully saved" },
  ]);
  const result = unwrap(await f.turn());
  assert.equal(f.discoveryCount(), 0);
  assert.equal("navigation" in result ? result.navigation : undefined,
    `/copilot?task=${f.task.id}&form=market`);
  assert.doesNotMatch(result.answer, /successfully saved/);
  const b = unwrap(await readPrivateTask(f.c, f.task.id));
  assert.equal(b.drafts.length, 1);
  assert.equal(readBusinessForm(b.drafts[0]!.text).fields.name, "GIS pilot");
  assert.ok(b.references.some((s) => s.id === SEG));
  assert.equal(b.capabilities.save, false);
  assert.equal(f.profiles[0], "drafting");
  const changed = unwrap(
    await changePrivateTask(f.c, f.task.id, {
      action: "business_form",
      revision: b.task.revision,
      key: "market",
      fields: { name: "Human corrected" },
    }),
  );
  assert.equal(
    readBusinessForm(changed.drafts[0]!.text).fields.name,
    "Human corrected",
  );
  f.set([
    f.tools("prepare_business_form", {
      module: "segment",
      key: "market",
      fields: { name: "Model overwrite", priority: 2 },
    }),
    { content: "Refined" },
  ]);
  unwrap(await f.turn());
  const updated = unwrap(await readPrivateTask(f.c, f.task.id));
  const form = readBusinessForm(updated.drafts[0]!.text);
  assert.equal(form.fields.name, "Human corrected");
  assert.equal(form.fields.priority, 2);
  assert.ok(f.prompts.some((p) => p.includes("Human corrected")));
  assert.ok(form.manualFields.includes("name"));
});
test("a source change during generation suppresses answer, forms and navigation", async () => {
  const f = await setup();
  f.set([
    f.tools("query_business", { kind: "segment" }),
    f.tools("prepare_business_form", {
      module: "segment",
      key: "m",
      fields: { name: "private" },
    }),
    { content: "sensitive result" },
  ]);
  let calls = 0;
  f.after(() => {
    if (++calls === 3)
      f.sources.set(SEG, { kind: "segment", id: SEG, version: "changed" });
  });
  assert.equal((await f.turn()).ok, false);
  const b = await f.store.load(
    { workspaceId: WS, actorSub: "alice" },
    f.task.id,
    true,
  );
  assert.equal(b!.drafts.length, 0);
  assert.equal(b!.messages.filter((m) => m.role === "assistant").length, 0);
});
test("arbitrary modules and model-supplied workspace identity are refused", async () => {
  for (const args of [
    { module: "sql", key: "x", fields: {} },
    {
      module: "segment",
      key: "x",
      fields: { name: "x" },
      workspaceId: randomUUID(),
    },
  ]) {
    const f = await setup();
    f.set([f.tools("prepare_business_form", args)]);
    assert.equal((await f.turn()).ok, false);
    assert.equal(
      (await f.store.load(
        { workspaceId: WS, actorSub: "alice" },
        f.task.id,
        true,
      ))!.drafts.length,
      0,
    );
  }
});
test("native form contract validates field limits, enums, quantities and UUID links", () => {
  for (const fields of [
    { name: "x".repeat(51) },
    { criteria: { needSummary: "x".repeat(61) } },
    { status: "published" },
    { priority: -1 },
    { productIds: ["PRD-1"] },
    { workspaceId: WS },
  ])
    assert.throws(() => fieldsFor("segment", fields));
  assert.throws(() =>
    fieldsFor("solution", {
      items: [{ productId: SEG, quantity: 0, optional: false, note: null }],
    }),
  );
  const human = mergeForm(
    mergeForm(null, "segment", null, { name: "Initial" }),
    "segment",
    null,
    { name: "Corrected" },
    true,
  );
  assert.equal(
    mergeForm(human, "segment", null, { name: "Again" }).fields.name,
    "Corrected",
  );
  assert.throws(() => mergeForm(human, "solution", null, {}));
  assert.match(formHref(human, WS, "m"), /^\/segment\/new\?/);
});
test("completion validates every source before making any in-memory side effect", async () => {
  const store = new InMemoryTaskStore(),
    scope = { workspaceId: WS, actorSub: "alice" };
  const ref = {
    kind: "segment" as const,
    id: SEG,
    version: "v1",
    role: "context" as const,
  };
  const t = await store.create(scope, "test", "xiaoyu/1", [ref], randomUUID());
  const turn = await store.beginTurn(
    scope,
    t.id,
    t.revision,
    randomUUID(),
    "q",
    "hash",
    "xiaoyu/1",
  );
  await assert.rejects(
    store.finishTurn(scope, t.id, turn!.id, {
      answer: "not committed",
      tokens: 1,
      references: [
        { ...ref, id: ACCESS },
        { ...ref, version: "v2" },
      ],
      forms: [{ key: "x", text: "unsafe" }],
    }),
  );
  const b = await store.load(scope, t.id, true);
  assert.equal(b!.references.length, 1);
  assert.equal(b!.drafts.length, 0);
  assert.equal(b!.messages.length, 1);
  assert.equal(b!.turns[0]!.status, "running");
});

test("correcting one need leaves other nested market fields available for model refinement",()=>{
 const initial=mergeForm(null,"segment",null,{name:"GIS",criteria:{needSummary:"Initial",customerNeed:"Initial need"}});
 const human=mergeForm(initial,"segment",null,{criteria:{needSummary:"Corrected",customerNeed:"Initial need"}},true);
 const next=mergeForm(human,"segment",null,{criteria:{needSummary:"Overwrite",customerNeed:"Refined need"}});
 assert.deepEqual(next.fields.criteria,{needSummary:"Corrected",customerNeed:"Refined need"});assert.deepEqual(next.manualFields,["criteria.needSummary"]);assert.deepEqual(readBusinessForm(JSON.stringify(next)),next);
});

test("execution requests only prepare reviewed proposals after immutable forms are persisted",async()=>{
 const f=await setup(),proposals:unknown[]=[];
 f.c.execution={propose:async(id,key,operation)=>{
  const b=await f.store.load({workspaceId:WS,actorSub:"alice"},id,true);
  assert.ok(b?.drafts.some(d=>d.key===key&&d.contractVersion==="business-form/1"));
  assert.equal(b?.turns.at(-1)?.status,"succeeded");
  proposals.push({key,operation});return {id:randomUUID()};
 },receipts:async()=>[]};
 f.set([f.tools("prepare_business_form",{module:"segment",key:"market",fields:{name:"Review me"}}),f.tools("request_business_execution",{key:"market",operation:"save"}),f.tools("read_execution_receipts",{}),{content:"Ready for your authorization"}]);
 const result=unwrap(await f.turn());assert.equal(proposals.length,1);assert.equal((result as {proposals?:unknown[]}).proposals?.length,1);
 assert.ok(!JSON.stringify(proposals).includes("grant"));
});

test("private turn usage survives refresh and revoked sources withhold its derived metadata",async()=>{
  const f=await setup();
  f.set([f.tools("query_business",{kind:"segment"}),{content:"Reviewed current market"}]);
  unwrap(await f.turn());
  const bundle=unwrap(await readPrivateTask(f.c,f.task.id));
  assert.ok(bundle.turns[0]!.artifacts);
  assert.equal(bundle.turns[0]!.artifacts!.usage.totalTokens,4);
  assert.deepEqual(bundle.turns[0]!.artifacts!.research,[]);
  f.sources.delete(SEG);
  const denied=await readPrivateTask(f.c,f.task.id);
  assert.equal(denied.ok,false);
});
