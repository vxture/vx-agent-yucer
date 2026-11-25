import { formReviewCatalog } from "./form-review";
import { InMemoryTaskStore } from "../../../domains/copilot/task-store";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { EMPTY_ENTITLEMENT } from "../../../entitlement/types";
import { PERM_CODES, permissionsForRoles } from "../../../authz/catalog";
import { scopeAccountStore } from "../../../authz/scoped-stores";
import {
  InMemoryAccountStore,
  type AccountRecord,
} from "../../../domains/account/store";
import type { AppSession } from "../../../(app)/lib/session";
import { InMemoryStrategyStore } from "../../../domains/strategy/store";
import { InMemoryCatalogStore } from "../../../domains/catalog/store";
import { InMemoryPipelineStore } from "../../../domains/pipeline/store";
import { emptyStrategyResult } from "../../../domains/strategy/lib/strategy-result";
import { InMemoryPlanningStore } from "../../../domains/planning/store";
import { InMemorySalesPlanStore } from "../../../domains/planning/plan-store";
import { changeSalesPlan } from "../../../domains/planning/plan-service";
import { withSalesPlanTargets } from "../../../domains/planning/effective-targets";
import { isTaskObject } from "../../../domains/copilot/lib/task-contract";
import { emptyContent } from "../../../domains/planning/plan-model";
import { InMemoryAuthzStore, getAuthzStore, setAuthzStore } from "../../../authz/store";
import {
  setPlanningStore,
  setCatalogStore,
  setStrategyStore,
} from "../../../domains/shared/registry";
import { businessBindings, accessSource, businessRecords } from "./business";
import { readTaskSource } from "./context";
import { mergeForm } from "../../../domains/copilot/lib/business-form";
const WS = randomUUID(),
  ID = randomUUID();
function session(store: InMemoryAccountStore, sub = "alice"): AppSession {
  return {
    workspaceId: WS,
    user: { sub },
    scope: { kind: "own", sub, accountIds: [] },
    authz: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: WS,
      product: "yucer",
      tier: "enterprise",
    },
    stores: {
      account: () =>
        scopeAccountStore(store, { kind: "own", sub, accountIds: [] }),
    },
  } as unknown as AppSession;
}
afterEach(() => {
  setPlanningStore(null);
  setStrategyStore(null);
  setCatalogStore(null);
  setAuthzStore(null);
});
test("controlled lookup obeys real account scope and never accepts SQL or workspace overrides", async () => {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [
      {
        id: ID,
        workspaceId: WS,
        name: "Alice customer",
        accountNo: "ACC-1",
        ownerSub: "alice",
        tier: "standard",
        status: "active",
      } as AccountRecord,
    ],
  });
  const c = session(store),
    b = businessBindings(c, (o) => readTaskSource(c, o));
  assert.equal((await b.query({ kind: "account" })).records.length, 1);
  assert.equal(
    (
      await businessBindings(session(store, "bob"), (o) =>
        readTaskSource(session(store, "bob"), o),
      ).query({ kind: "account" })
    ).records.length,
    0,
  );
  for (const input of [
    { kind: "account", sql: "select *" },
    { kind: "account", workspaceId: randomUUID() },
    { kind: "account", id: "ACC-1" },
    { kind: "agent_message" },
    ...[-1, 0.5, 1000001, "0"].map(offset => ({ kind: "account", offset })),
    ...[0, 21, 1.5, "10"].map(limit => ({ kind: "account", limit })),
    ...[[], ["x.constructor"], ["__proto__"], [1], ["x[0]"], Array(11).fill("name"), "name"].map(fields => ({ kind: "account", fields })),
    { kind: "account", textOffset: 0 },
    { kind: "account", id: ID, fields: ["name", "status"], textOffset: 0 },
    { kind: "account", id: ID, fields: ["name"], textOffset: -1 },
    { kind: "account", id: ID, fields: ["name"], textOffset: 0.5 },
    { kind: "account", id: ID, fields: ["name"], textOffset: "0" },
    { kind: "account", id: ID, fields: ["missing"], textOffset: 0 },
  ])
    await assert.rejects(b.query(input));
  const ref = await readTaskSource(c, { kind: "account", id: ID });
  const detail = await b.query({ kind: "account", id: ID, fields: ["name"], textOffset: 6 });
  assert.deepEqual(detail.records[0]!.source, ref);
  assert.equal((detail.records[0]!.record as Record<string, string>).name, "customer");
  assert.equal((await businessBindings(session(store, "bob"), o => readTaskSource(session(store, "bob"), o))
    .query({ kind: "account", id: ID, fields: ["name"] })).returnedCount, 0);
  assert.ok(
    (await b.query({ kind: "account", query: "no match" })).sources.some(
      (s) => s.kind === "access",
    ),
  );
});
test("access fingerprints track capability and scope changes, not metered quota consumption", () => {
  const c = session(new InMemoryAccountStore()),
    first = accessSource(c);
  c.entitlement.quota_pools = [
    { metric: "tokens", limit: 100, remaining: 90, priority: 1 },
  ];
  assert.deepEqual(accessSource(c), first);
  c.authz = { ...c.authz, permissions: new Set() };
  assert.notEqual(accessSource(c).version, first.version);
});
test("foreign UUID relations and stale form targets are rejected by controlled source resolution", async () => {
  const strategy = new InMemoryStrategyStore();
  setStrategyStore(strategy);
  const c = session(new InMemoryAccountStore());
  c.authz = {
    ...c.authz,
    permissions: new Set(permissionsForRoles(["sales_leader"])),
  };
  const b = businessBindings(c, (o) => readTaskSource(c, o));
  await assert.rejects(
    b.prepare(
      mergeForm(null, "segment", null, {
        name: "Market",
        solutionIds: [randomUUID()],
      }),
    ),
  );
  await assert.rejects(
    b.prepare({
      ...mergeForm(null, "segment", ID, { name: "Market" }),
      baseVersion: "outdated",
    }),
  );
  await assert.rejects(businessRecords(c, "agent_task"));
});

function configured() {
  const account = new InMemoryAccountStore(),
    strategy = new InMemoryStrategyStore(),
    catalog = new InMemoryCatalogStore();
  setStrategyStore(strategy);
  setCatalogStore(catalog);
  const authz = new InMemoryAuthzStore();
  authz.seed(WS, "alice", ["sales_leader"]);
  setAuthzStore(authz);
  const c = session(account);
  c.scope = { kind: "workspace" };
  c.authz = { ...c.authz, permissions: new Set(PERM_CODES) };
  c.stores = { ...c.stores, pipeline: () => new InMemoryPipelineStore() };
  return {
    c,
    strategy,
    catalog,
    b: businessBindings(c, (o) => readTaskSource(c, o)),
  };
}
test("native contracts obtain configured vocabulary, members and currency, with permission refusal", async () => {
  const f = configured();
  for (const module of [
    "segment",
    "solution",
    "strategy",
    "sales_plan",
  ] as const) {
    const contract = await f.b.contract(module);
    assert.equal(contract.configuration.currency, "CNY");
    if (module === "strategy") {
      assert.ok(Array.isArray(contract.configuration.strategyTypes));
      assert.ok(Array.isArray(contract.configuration.members));
    }
    if (module === "segment") assert.ok(contract.configuration.vocabulary);
    if (module === "sales_plan")
      assert.equal(
        (contract.configuration.contentTemplate as { releaseScope: string })
          .releaseScope,
        "company",
      );
  }
  f.c.authz = { ...f.c.authz, permissions: new Set() };
  await assert.rejects(f.b.contract("strategy"), /permission_denied/);
  await assert.rejects(f.b.contract("sales_plan"), /permission_denied/);
  await assert.rejects(
    f.b.prepare(
      mergeForm(null, "solution", null, { name: "Denied", items: [] }),
    ),
    /permission_denied/,
  );
  for (const kind of [
    "account",
    "opportunity",
    "segment",
    "strategy",
    "product",
    "solution",
    "sales_plan",
  ])
    await assert.rejects(businessRecords(f.c, kind));
});
test("controlled records exclude superseded strategies and bind existing relation versions", async () => {
  const f = configured(),
    market = randomUUID(),
    product = randomUUID(),
    solution = randomUUID();
  f.strategy.seed({
    segments: [
      {
        id: market,
        workspaceId: WS,
        name: "GIS",
        segmentCode: "MKT-1",
        priority: 1,
        status: "active",
        criteria: { industries: [], regions: [], sizes: [] },
        solutionIds: [],
        productIds: [],
      },
    ],
  });
  const accountContract = await f.b.contract("account");
  assert.deepEqual((accountContract.configuration.vocabulary as { segments: unknown[] }).segments,
    [{ id: market, name: "GIS" }]);
  f.catalog.seed({
    products: [
      {
        id: product,
        workspaceId: WS,
        name: "Agent",
        productCode: "PRD-1",
        status: "active",
        sortOrder: 0,
      } as never,
    ],
    solutions: [
      {
        id: solution,
        workspaceId: WS,
        name: "Bundle",
        solutionCode: "SOL-1",
        status: "active",
        sortOrder: 0,
      } as never,
    ],
  });
  for (const kind of [
    "segment",
    "product",
    "solution",
    "opportunity",
    "strategy",
    "sales_plan",
  ]) {
    assert.ok(Array.isArray(await businessRecords(f.c, kind)));
  }
  const refs = await f.b.prepare(
    mergeForm(null, "segment", market, {
      name: "GIS",
      productIds: [product],
      solutionIds: [solution],
    }),
  );
  assert.ok(refs.baseVersion);
  assert.equal(refs.sources.length, 4);
  await assert.rejects(
    f.b.prepare({ ...refs, baseVersion: "old" }),
    /source_changed/,
  );
  const result = emptyStrategyResult(),
    types = await f.strategy.listStrategyTypes(WS),
    options = await f.strategy.listStrategyOptions(WS);
  result.valuePropositionId = options.find((o) => o.kind === "value")!.id!;
  result.pathIds = [options.find((o) => o.kind === "path")!.id!];
  const form = mergeForm(null, "strategy", null, {
    name: "Strategy",
    strategyTypeId: types[0]!.id,
    ownerSub: "alice",
    result,
    targetMarkets: [
      {
        segmentId: market,
        intent: "focus",
        approach: null,
        productIds: [product],
        solutionIds: [solution],
      },
    ],
  });
  assert.ok((await f.b.prepare(form)).sources.some((r) => r.id === market));
  await assert.rejects(
    f.b.prepare({
      ...form,
      fields: { ...form.fields, strategyTypeId: randomUUID() },
    }),
    /invalid_form_configuration/,
  );
  await assert.rejects(
    f.b.prepare({ ...form, fields: { ...form.fields, ownerSub: "unknown" } }),
    /invalid_form_owner/,
  );
  for (const patch of [
    { valuePropositionId: randomUUID() },
    { pathIds: [randomUUID()] },
  ])
    await assert.rejects(
      f.b.prepare({
        ...form,
        fields: { ...form.fields, result: { ...result, ...patch } },
      }),
      /invalid_form_configuration/,
    );
  await assert.rejects(
    f.b.prepare(
      mergeForm(null, "segment", null, {
        criteria: { industries: ["unknown"] },
      }),
    ),
    /invalid_form_configuration/,
  );
  await assert.rejects(
    f.b.prepare(
      mergeForm(null, "strategy", null, {
        targetMarkets: [{ segmentId: market, intent: "other", approach: null }],
      }),
    ),
    /invalid_form_relation/,
  );
  await assert.rejects(
    f.b.prepare(
      mergeForm(null, "strategy", null, {
        targetMarkets: [
          {
            segmentId: market,
            intent: "focus",
            approach: null,
            productIds: ["PRD-1"],
          },
        ],
      }),
    ),
    /invalid_form_relation/,
  );
  const item = { productId: product, quantity: 1, optional: false, note: null };
  assert.ok(
    (
      await f.b.prepare(
        mergeForm(null, "solution", null, { name: "Bundle", items: [item] }),
      )
    ).sources.some((s) => s.id === product),
  );
  await assert.rejects(
    f.b.prepare(
      mergeForm(null, "solution", null, {
        name: "Bundle",
        items: [{ ...item, productId: randomUUID() }],
      }),
    ),
    /source_unavailable/,
  );
});
test("sales planning contract enforces year consistency and workspace scope", async () => {
  const f = configured(),
    content = emptyContent(2027, [], "CNY");
  assert.equal(
    (
      await f.b.prepare(
        mergeForm(null, "sales_plan", null, { year: 2027, content }),
      )
    ).module,
    "sales_plan",
  );
  await assert.rejects(
    f.b.prepare(mergeForm(null, "sales_plan", null, { year: 2028, content })),
    /invalid_form_year/,
  );
  f.c.scope = { kind: "own", sub: "alice", accountIds: [] };
  await assert.rejects(f.b.contract("sales_plan"), /permission_denied/);
  await assert.rejects(businessRecords(f.c, "sales_plan"), /permission_denied/);
  for (const query of [
    { kind: "segment", year: 1999 },
    { kind: "segment", query: 1 },
    { kind: "segment", query: "x".repeat(201) },
  ])
    await assert.rejects(f.b.query(query), /business_query_denied/);
});

test("review catalogs resolve nested relations, strategy choices and members without displaying stored IDs",async()=>{
  const f=configured(),accounts=new InMemoryAccountStore(),parent=randomUUID(),hidden=randomUUID(),market=randomUUID(),product=randomUUID(),solution=randomUUID();
  accounts.seed({accounts:[{id:parent,workspaceId:WS,name:"Visible parent",accountNo:"ACC-1",ownerSub:"alice",tier:"standard",status:"active"},{id:hidden,workspaceId:WS,name:"Other member customer",accountNo:"ACC-2",ownerSub:"bob",tier:"standard",status:"active"}] as AccountRecord[]});
  f.c.stores={...f.c.stores,account:()=>scopeAccountStore(accounts,{kind:"own",sub:"alice",accountIds:[]})};
  f.strategy.seed({segments:[{id:market,workspaceId:WS,name:"Research market",segmentCode:"MKT-1",priority:1,status:"active",criteria:{industries:[],regions:[],sizes:[]},solutionIds:[],productIds:[]}]});
  f.catalog.seed({products:[{id:product,workspaceId:WS,name:"Core product",productCode:"PRD-1",sortOrder:0} as never],solutions:[{id:solution,workspaceId:WS,name:"Related solution",solutionCode:"SOL-1",status:"active",sortOrder:0} as never]});
  await getAuthzStore().seeMember({workspaceId:WS,sub:"alice",displayName:"Alice reviewer"});
  const store=new InMemoryTaskStore(),scope={workspaceId:WS,actorSub:"alice"};
  const t=await store.create(scope,"Review forms","r1",[],randomUUID()),bundle=(await store.load(scope,t.id,true))!;
  for(const [module,fields]of [
    ["account",{name:"Customer",parentId:parent,childLinks:[{accountId:hidden,expectedParentId:null}]}],
    ["segment",{name:"Market",criteria:{industries:[],regions:[],sizes:[]},solutionIds:[solution],productIds:[product]}],
    ["solution",{name:"Solution",items:[{productId:product,quantity:2,optional:false,note:null}]}],
    ["strategy",{name:"Strategy",ownerSub:"alice",targetMarkets:[{segmentId:market,intent:"focus",approach:null}]}],
    ["sales_plan",{year:2026,content:emptyContent(2026,[],"CNY")}],
  ] as const){
    bundle.drafts.push({id:randomUUID(),key:module,revision:1,contractVersion:"business-form/1",text:JSON.stringify(mergeForm(null,module,null,fields)),createdAt:new Date()});
  }
  const catalog=await formReviewCatalog(f.c,bundle);
  assert.equal(catalog.account!.labels[parent],"Visible parent");assert.equal(catalog.account!.labels[hidden],undefined);
  assert.equal(catalog.solution!.labels[product],"Core product");assert.equal(catalog.segment!.labels[solution],"Related solution");
  assert.equal(catalog.strategy!.labels[market],"Research market");
  assert.ok(catalog.strategy!.options.strategyTypes!.length>0);assert.ok(catalog.account!.options.provinces!.length>0);
  assert.ok(catalog.strategy!.options.members!.some(m=>m.value==="alice"));
  assert.doesNotMatch(JSON.stringify(catalog),/Other member customer/);
});

test("published plan projections are queryable UUID sources with live attainment and access checks", async () => {
  const f = configured(), plans = new InMemorySalesPlanStore();
  const raw = new InMemoryPlanningStore();
  setPlanningStore(withSalesPlanTargets(raw, plans));
  const ctx = { workspaceId: WS, sub: "alice", holder: f.c.authz, entitlement: f.c.entitlement, scope: f.c.scope, store: plans };
  const year = new Date().getUTCFullYear(), content = emptyContent(year, [], "CNY");
  content.targets[0]!.target = "1000";
  content.allocationNote = "Company target; regions will follow";
  const plan = await changeSalesPlan(ctx, { year, expectedEventNo: 0, requestKey: randomUUID(), command: { kind: "draft", content } });
  await changeSalesPlan(ctx, { year, expectedEventNo: 1, requestKey: randomUUID(), command: { kind: "release", revisionId: plan.revisions[0]!.id, editToken: 1, reason: "" } });
  const page = await f.b.query({ kind: "sales_target" });
  const source = page.sources.find(s => s.kind === "sales_target")!;
  assert.ok(source);
  assert.ok(isTaskObject({ kind: source.kind, id: source.id }));
  const detail = await f.b.query({ kind: "sales_target", id: source.id });
  assert.equal(detail.returnedCount, 1);
  assert.deepEqual(detail.records[0]!.source, source);
  assert.equal((detail.records[0]!.record as { id: string }).id, source.id);
  raw.seed({ published: { [`${WS}|Y${year}|workspace||`]: { closedAmount: { amount: 100, currency: "CNY" }, pipelineAmount: { amount: 200, currency: "CNY" }, newLogoCount: 2 } } });
  const measured = await readTaskSource(f.c, source);
  assert.ok(measured);
  assert.notEqual(measured.version, source.version);
  assert.equal(measured.id, source.id);
  assert.equal(await readTaskSource({ ...f.c, workspaceId: randomUUID() }, source), null);
  assert.equal(await readTaskSource({ ...f.c, scope: { kind: "own", sub: "alice", accountIds: [] } }, source), null);
  f.c.authz = { ...f.c.authz, permissions: new Set() };
  assert.equal(await readTaskSource(f.c, source), null);
  await assert.rejects(f.b.query({ kind: "sales_target" }), /permission_denied/);
});
