import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test } from "node:test";
import { InMemoryAccountStore } from "../account/store";
import { writeBusinessForm } from "./execution-domain";
import { mergeForm, type FormModule } from "./lib/business-form";
import { InMemoryStrategyStore } from "../strategy/store";
import { InMemoryCatalogStore } from "../catalog/store";
import {
  setAccountStore,
  setStrategyStore,
  setCatalogStore,
  getSalesPlanStore,
} from "../shared/registry";
import { InMemoryAuthzStore, setAuthzStore } from "../../authz/store";
import { PERM_CODES } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import type { AppSession } from "../../(app)/lib/session";
import { emptyStrategyResult } from "../strategy/lib/strategy-result";
import { emptyContent, planVersions } from "../planning/plan-model";
afterEach(() => {
  setAccountStore(null);
  setStrategyStore(null);
  setCatalogStore(null);
  setAuthzStore(null);
});
// The legacy in-memory domain adapter allocates textual IDs. Engine/DB tests
// separately enforce UUIDs; these tests exercise only native service mapping.
function editForm(
  module: FormModule,
  targetId: string,
  fields: Record<string, unknown>,
) {
  return { ...mergeForm(null, module, null, fields), targetId };
}
function fixture() {
  const workspaceId = randomUUID(),
    strategy = new InMemoryStrategyStore(),
    catalog = new InMemoryCatalogStore(),
    authz = new InMemoryAuthzStore();
  setStrategyStore(strategy);
  setCatalogStore(catalog);
  authz.seed(workspaceId, "owner", ["sales_leader"]);
  setAuthzStore(authz);
  const session = {
    workspaceId,
    user: { sub: "owner" },
    scope: { kind: "workspace" },
    authz: { permissions: new Set(PERM_CODES) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: workspaceId,
      product: "yucer",
      tier: "enterprise",
    },
  } as unknown as AppSession;
  return { session, strategy, catalog };
}
test("native segment and solution edits preserve omitted fields and UUID-based relations", async () => {
  const f = fixture(),
    product = randomUUID();
  f.catalog.seed({
    statuses: [
      {
        id: randomUUID(),
        workspaceId: f.session.workspaceId,
        statusCode: "active",
        name: "Active",
        sortOrder: 0,
      } as never,
    ],
    products: [
      {
        id: product,
        workspaceId: f.session.workspaceId,
        productCode: "PRD-1",
        name: "Agent",
        statusId: "active",
        sortOrder: 0,
      } as never,
    ],
  });
  const market = await writeBusinessForm(
    f.session,
    mergeForm(null, "segment", null, {
      name: "GIS",
      priority: 7,
      status: "active",
      criteria: {
        industries: [],
        regions: [],
        sizes: [],
        needSummary: "Mapping",
        customerNeed: "Reusable workflows",
      },
      productIds: [product],
    }),
    "save",
    randomUUID(),
  );
  await writeBusinessForm(
    f.session,
    editForm("segment", market.id, { name: "GIS refined" }),
    "save",
    randomUUID(),
  );
  const segment = (await f.strategy.listSegments(f.session.workspaceId))[0]!;
  assert.equal(segment.priority, 7);
  assert.equal(segment.criteria.customerNeed, "Reusable workflows");
  assert.deepEqual(segment.productIds, [product]);
  const solution = await writeBusinessForm(
    f.session,
    mergeForm(null, "solution", null, {
      name: "Bundle",
      summary: "Reviewed",
      scenario: "Mapping",
      novelty: "existing",
      items: [{ productId: product, quantity: 1, optional: false, note: null }],
    }),
    "save",
    randomUUID(),
  );
  await writeBusinessForm(
    f.session,
    editForm("solution", solution.id, { summary: "New summary" }),
    "save",
    randomUUID(),
  );
  assert.equal(
    (await f.catalog.listSolutions(f.session.workspaceId))[0]!.name,
    "Bundle",
  );
  assert.equal(
    (await f.catalog.listSolutionItems(f.session.workspaceId, solution.id))
      .length,
    1,
  );
  await assert.rejects(
    writeBusinessForm(
      f.session,
      editForm("segment", market.id, { name: "Cannot publish" }),
      "publish",
      randomUUID(),
    ),
    /operation_not_registered/,
  );
});
test("strategy publishes only saved fields, validates native requirements and preserves version identity", async () => {
  const f = fixture(),
    workspace = f.session.workspaceId;
  const market = await writeBusinessForm(
    f.session,
    mergeForm(null, "segment", null, {
      name: "GIS",
      priority: 0,
      criteria: { industries: [], regions: [], sizes: [] },
    }),
    "save",
    randomUUID(),
  );
  const type = (await f.strategy.listStrategyTypes(workspace))[0]!,
    value = (await f.strategy.listStrategyOptions(workspace)).find(
      (o) => o.kind === "value",
    )!;
  const result = {
    ...emptyStrategyResult(),
    valuePropositionId: value.id!,
    goals: [
      {
        id: randomUUID(),
        metric: "revenue" as const,
        name: "Revenue",
        baseline: "0",
        target: "1000000",
        unit: "CNY",
        dueOn: "2099-12-31",
        criterion: "Signed revenue",
      },
    ],
  };
  const form = mergeForm(null, "strategy", null, {
    name: "GIS strategy",
    period: "2099",
    objective: "Develop GIS partners",
    ownerSub: "owner",
    strategyTypeId: type.id,
    result,
    targetMarkets: [{ segmentId: market.id, intent: "focus", approach: null }],
  });
  const saved = await writeBusinessForm(f.session, form, "save", randomUUID());
  await assert.rejects(
    writeBusinessForm(
      f.session,
      {
        ...form,
        targetId: saved.id,
        fields: { ...form.fields, name: "Unsaved" },
      },
      "publish",
      randomUUID(),
    ),
    /unsaved_form_changes/,
  );
  const edited = editForm("strategy", saved.id, {
    objective: "Focus partner-led GIS sales",
  });
  await writeBusinessForm(f.session, edited, "save", randomUUID());
  assert.equal(
    (await f.strategy.getPlan(workspace, saved.id))!.name,
    "GIS strategy",
  );
  const published = await writeBusinessForm(
    f.session,
    editForm("strategy", saved.id, {}),
    "publish",
    randomUUID(),
  );
  assert.equal(published.id, saved.id);
  assert.equal(
    (await f.strategy.getPlan(workspace, saved.id))!.status,
    "approved",
  );
  await assert.rejects(
    writeBusinessForm(
      f.session,
      mergeForm(null, "strategy", null, { name: "Missing saved object" }),
      "publish",
      randomUUID(),
    ),
    /saved_draft_required/,
  );
});
test("sales plan uses original draft/save/release services and never publishes unsaved content", async () => {
  const f = fixture(),
    content = emptyContent(2099, [], "CNY");
  content.releaseScope = "company";
  for (const target of content.targets) target.target = "1000";
  const form = mergeForm(null, "sales_plan", null, { year: 2099, content });
  const saved = await writeBusinessForm(f.session, form, "save", randomUUID());
  let plan = (await getSalesPlanStore().read(f.session.workspaceId, 2099))!;
  assert.ok(planVersions(plan, new Date().toISOString()).draft);
  const changed = structuredClone(content);
  changed.assumptions = "Reviewed assumptions";
  await writeBusinessForm(
    f.session,
    { ...form, targetId: saved.id, fields: { year: 2099, content: changed } },
    "save",
    randomUUID(),
  );
  await assert.rejects(
    writeBusinessForm(
      f.session,
      { ...form, targetId: saved.id },
      "publish",
      randomUUID(),
    ),
    /unsaved_form_changes/,
  );
  await writeBusinessForm(
    f.session,
    { ...form, targetId: saved.id, fields: { year: 2099, content: changed } },
    "publish",
    randomUUID(),
  );
  plan = (await getSalesPlanStore().read(f.session.workspaceId, 2099))!;
  assert.equal(plan.revisions[0]!.version, 1);
  assert.equal(plan.revisions[0]!.state, "sealed");
});

test("ten customer drafts use native create; duplicate retry, permission loss and workspace boundaries are enforced",async()=>{
 const f=fixture(),accounts=new InMemoryAccountStore();setAccountStore(accounts);f.session.stores={account:()=>accounts} as unknown as AppSession["stores"];
 const forms=Array.from({length:10},(_,i)=>mergeForm(null,"account",null,{name:`Acceptance customer ${i}`,tier:"standard",employeeCount:null}));
 const results=[];for(const form of forms)results.push(await writeBusinessForm(f.session,form,"save",randomUUID()));
 assert.equal(new Set(results.map(r=>r.id)).size,10);assert.equal((await accounts.listAccounts(f.session.workspaceId)).length,10);
 await assert.rejects(writeBusinessForm(f.session,forms[0]!,"save",randomUUID()),/duplicate_customer/);
 await assert.rejects(writeBusinessForm({...f.session,authz:{...f.session.authz,permissions:new Set()}},mergeForm(null,"account",null,{name:"Refused"}),"save",randomUUID()),/permission/);
 const other={...f.session,workspaceId:randomUUID(),entitlement:{...f.session.entitlement}};other.entitlement.workspace_id=other.workspaceId;
 await writeBusinessForm(other,forms[0]!,"save",randomUUID());assert.equal((await accounts.listAccounts(other.workspaceId)).length,1);
});
