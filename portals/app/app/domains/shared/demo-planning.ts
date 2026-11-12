// Repeatable current-year planning and execution fixtures. Memory stores only.
import { randomUUID } from "node:crypto";
import {
  emptyContent,
  digest,
  validateContent,
  type SalesPlan,
} from "../planning/plan-model";
import type { InMemorySalesPlanStore } from "../planning/plan-store";
import type { InMemoryPlanningStore } from "../planning/store";
import type { InMemoryAccountStore } from "../account/store";
import type {
  InMemoryPipelineStore,
  OpportunityRecord,
} from "../pipeline/store";
import type { InMemoryCatalogStore } from "../catalog/store";
import type { InMemoryFieldStore } from "../account/field-store";
import { planSnapshot, type SnapshotRow } from "../pipeline/lib/forecast";
import { writePrerequisites } from "../planning/plan-prerequisites";
import { DEMO_SUCCESSOR_SUBS } from "./demo-members";
import { DEMO_PLANNING_TEXT as T } from "./demo-fixtures";
import { periodRange } from "./period";
import { money } from "./money";

export type PlanningDemoStores = {
  plans: InMemorySalesPlanStore;
  planning: InMemoryPlanningStore;
  account: InMemoryAccountStore;
  pipeline: InMemoryPipelineStore;
  catalog: InMemoryCatalogStore;
  field: InMemoryFieldStore;
};
// Demo references stay stable within the memory-store process. Generate their
// identity independently of workspace/member credentials rather than hashing them.
const fixtureIds = new Map<string, Map<string, string>>();
function id(workspace: string, value: string) {
  let ids = fixtureIds.get(workspace);
  if (!ids) {
    ids = new Map();
    fixtureIds.set(workspace, ids);
  }
  let key = ids.get(value);
  if (!key) {
    key = randomUUID();
    ids.set(value, key);
  }
  return key;
}
const at = (start: number, end: number, fraction: number) =>
  new Date(start + Math.max(0, end - start) * fraction);

export async function seedPlanningDemo(
  workspaceId: string,
  stores: PlanningDemoStores,
  reviewer: { sub: string; name: string },
  now = new Date(),
): Promise<void> {
  const year = now.getUTCFullYear();
  const units = await stores.planning.listOrgUnits(workspaceId);
  const placements = await stores.planning.listOrgMembers(workspaceId);
  const headquarters = units.find((u) => u.unitCode === "headquarters");
  if (headquarters && !placements.get(reviewer.sub)?.length)
    await stores.planning.setMemberUnits(workspaceId, reviewer.sub, [
      headquarters.id,
    ]);
  // Never replace a plan the reviewer has edited or published.
  if (await stores.plans.read(workspaceId, year)) return;
  const [
    divisions,
    territories,
    accounts,
    existingDeals,
    legacy,
    allProducts,
    statuses,
  ] = await Promise.all([
    stores.account.listMarketDivisions(workspaceId),
    stores.planning.listTerritories(workspaceId),
    stores.account.listAccounts(workspaceId),
    stores.pipeline.listOpportunities(workspaceId, { includeClosed: true }),
    stores.planning.listTargets(workspaceId),
    stores.catalog.listProducts(workspaceId),
    stores.catalog.listStatusConfigs(workspaceId),
  ]);
  const products = allProducts.filter((p) =>
    statuses.some((s) => s.id === p.statusId && s.statusCode === "active"),
  );
  const regions = divisions.flatMap((d) => {
    const t = territories.find(
      (t) =>
        t.territoryCode === "AUTO-" + d.code && t.divisionIds.includes(d.id),
    );
    return t
      ? [
          {
            id: t.id,
            divisionId: d.id,
            code: d.code,
            name: d.name,
            provinces: d.members.map((m) => m.label),
            included: true,
            reason: "",
            ownerSub: reviewer.sub,
          },
        ]
      : [];
  });
  if (!regions.length || !accounts.length) return;
  const content = emptyContent(year, regions, "CNY");
  content.targets = [];
  const root = "Y" + year;
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
  const quarter = year + "Q" + currentQuarter;
  const quarterRange = periodRange(quarter)!;
  const version1At = new Date(Date.UTC(year, 0, 1)).toISOString();
  const version2At = at(
    quarterRange.start.getTime(),
    now.getTime(),
    0.65,
  ).toISOString();
  const shares = regions.map((_, i) => i + 1);
  const shareTotal = shares.reduce((a, b) => a + b, 0);
  const annual = 96_000_000;
  const amounts = regions.map((_, i) =>
    Math.round((annual * shares[i]) / shareTotal),
  );
  amounts[amounts.length - 1] += annual - amounts.reduce((a, b) => a + b, 0);
  const selected = new Set<string>();
  const customers = regions.map((region) => {
    const account =
      accounts.find(
        (a) =>
          !selected.has(a.id) &&
          (a.region === region.name ||
            (a.province && region.provinces.includes(a.province))),
      ) ??
      accounts.find((a) => !selected.has(a.id)) ??
      accounts[0];
    selected.add(account.id);
    return account;
  });
  const deals: OpportunityRecord[] = [];
  const targetKey = (scope: string, period: string) =>
    id(workspaceId, "target|" + year + "|" + scope + "|" + period);
  for (const [i, scope] of [
    "workspace",
    ...regions.map((r) => "territory:" + r.id),
  ].entries()) {
    const yearly = i === 0 ? annual : amounts[i - 1];
    for (const period of content.periods) {
      const amount = period.key === root ? yearly : yearly / 4;
      content.targets.push({
        key: targetKey(scope, period.key),
        scope,
        period: period.key,
        metric: "revenue",
        currency: "CNY",
        floor: String(amount * 0.8),
        target: String(amount),
        stretch: String(amount * 1.2),
        note: T.targetNote,
      });
    }
  }
  for (const [i, region] of regions.entries()) {
    const customer = customers[i];
    const ownerSub = i % 2 === 0 ? reviewer.sub : DEMO_SUCCESSOR_SUBS.rep2;
    for (const period of content.periods) {
      const regionalTarget = Number(
        content.targets.find(
          (t) =>
            t.scope === "territory:" + region.id && t.period === period.key,
        )!.target,
      );
      const key = id(
        workspaceId,
        "budget|" + year + "|" + i + "|" + period.key,
      );
      content.budgets.push({
        key,
        accountId: customer.id,
        name: customer.name,
        tier: customer.tier,
        period: period.key,
        metric: "revenue",
        currency: "CNY",
        amount: String(regionalTarget * 0.6),
        sourcePlanId: null,
        sourceReadAt: version1At,
        note: T.budgetNote,
      });
      content.contributions.push({
        key: id(workspaceId, "contribution|" + key),
        budgetKey: key,
        targetKey: targetKey("territory:" + region.id, period.key),
        regionId: region.id,
        responsibility: "primary",
        amount: String(regionalTarget * 0.6),
      });
      const range = periodRange(period.key)!;
      content.actions.push({
        key: id(workspaceId, "action|" + key),
        regionId: region.id,
        targetKey: targetKey("territory:" + region.id, period.key),
        accountId: customer.id,
        objective: T.action,
        ownerSub,
        due: at(range.start.getTime(), range.end.getTime(), 0.75)
          .toISOString()
          .slice(0, 10),
        evidenceRefs:
          period.key === root || range.start > now || i % 5 === 3
            ? []
            : [
                "opportunity:" +
                  id(
                    workspaceId,
                    "deal|" + year + "|" + i + "|" + period.key + "|0",
                  ),
              ],
      });
    }
    for (const [memberSub, memberName] of [
      [reviewer.sub, reviewer.name],
      [DEMO_SUCCESSOR_SUBS.rep2, T.partner],
    ]) {
      content.team.push({
        key: id(workspaceId, "team|" + year + "|" + i + "|" + memberSub),
        regionId: region.id,
        memberSub,
        memberName,
        unitId: null,
        unitName: "",
        role: T.role,
        start: year + "-01-01",
        end: year + 1 + "-01-01",
        percent: 100 / regions.length,
        requestedFte: null,
        note: T.teamNote,
      });
    }
    for (let q = 1; q <= currentQuarter; q++) {
      const period = year + "Q" + q;
      const range = periodRange(period)!;
      const elapsedEnd = Math.min(now.getTime(), range.end.getTime() - 1);
      const target = amounts[i] / 4;
      const rates = [1.12, 0.65, 0.38, 0, 0.9];
      const kinds = [
        {
          stage: "won",
          status: "won",
          category: "closed",
          value: target * rates[i % rates.length],
          probability: 100,
        },
        {
          stage: "negotiate",
          status: "open",
          category: "commit",
          value: target * 0.45,
          probability: 90,
        },
        {
          stage: "propose",
          status: "open",
          category: "best_case",
          value: target * 0.75,
          probability: 65,
        },
        {
          stage: "discover",
          status: "open",
          category: "pipeline",
          value: target * 1.1,
          probability: 25,
        },
      ] as const;
      kinds.forEach((kind, k) => {
        // One active region has no wins yet; the others have distinct attainment.
        if (kind.status === "won" && !kind.value) return;
        const closedAt =
          kind.status === "won"
            ? at(range.start.getTime(), elapsedEnd, 0.25)
            : null;
        deals.push({
          id: id(
            workspaceId,
            "deal|" + year + "|" + i + "|" + period + "|" + k,
          ),
          workspaceId,
          opportunityNo: "DEMO-" + year + "-" + (i + 1) + q + (k + 1),
          name: region.name + " " + T.deals[k] + " " + period,
          accountId: customer.id,
          accountName: customer.name,
          planId: null,
          campaignId: null,
          territoryId: region.id,
          ownerSub,
          requirement: T.requirement,
          stage: kind.stage,
          status: kind.status,
          forecastCategory: kind.category,
          amount: money(Math.round(kind.value), "CNY"),
          probability: kind.probability,
          expectedCloseAt:
            closedAt ?? at(range.start.getTime(), range.end.getTime(), 0.9),
          closedAt,
          currency: "CNY",
          sourceProjectId: null,
          createdAt: range.start,
          contractTypeId: null,
          businessFormId: null,
        });
      });
    }
  }
  content.team.push({
    key: id(workspaceId, "request|" + year),
    regionId: regions.at(-1)!.id,
    memberSub: null,
    memberName: "",
    unitId: null,
    unitName: "",
    role: T.requestRole,
    start: year + "-01-01",
    end: year + 1 + "-01-01",
    percent: 0,
    requestedFte: "0.5",
    note: T.requestNote,
  });
  content.assumptions = writePrerequisites({
    general: [],
    customers: [T.customerPremise],
    products: [T.productPremise],
    people: [T.peoplePremise],
    services: [T.servicePremise],
  });
  content.allocationNote = T.allocationNote;
  validateContent(content, true);
  const first = structuredClone(content);
  first.targets
    .filter((t) => t.scope === "workspace")
    .forEach((t) => {
      for (const tier of ["floor", "target", "stretch"] as const)
        t[tier] = String(Number(t[tier]) * 1.25);
    });
  validateContent(first, true);
  const planId = id(workspaceId, "plan|" + year);
  const revisions = [first, content].map((c, n) => ({
    id: id(workspaceId, "revision|" + year + "|" + (n + 1)),
    state: "sealed" as const,
    editToken: 2,
    version: n + 1,
    baseId: n ? id(workspaceId, "revision|" + year + "|1") : null,
    restoresId: null,
    content: c,
    contentHash: digest(c),
    reason: n ? T.revisionReason : T.baselineReason,
    createdBy: reviewer.sub,
    createdAt: n ? version2At : version1At,
    sealedBy: reviewer.sub,
    sealedAt: n ? version2At : version1At,
  }));
  const plan: SalesPlan = {
    id: planId,
    workspaceId,
    year,
    revisions,
    events: revisions.map((r, i) => ({
      no: i + 1,
      kind: "release",
      revisionId: r.id,
      relatedNo: null,
      period: null,
      at: r.sealedAt,
      effectiveAt: r.sealedAt,
      actor: reviewer.sub,
      reason: r.reason,
      requestKey: id(workspaceId, "release|" + r.id),
      requestHash: digest(r),
    })),
    legacy: legacy
      .filter(
        (t) =>
          t.scopeType === "workspace" &&
          t.metric === "revenue" &&
          content.periods.some(
            (p) => p.key === t.period || p.key === "Y" + t.period,
          ),
      )
      .map((t) => ({
        targetId: t.id,
        revisionId: revisions[0].id,
        snapshot: t,
      })),
  };
  const pool = [...existingDeals, ...deals];
  const snapshots: Array<SnapshotRow & { workspaceId: string }> = [];
  for (const period of [
    root,
    ...content.periods
      .filter((p) => p.parent && new Date(p.start) <= now)
      .map((p) => p.key),
  ]) {
    for (const scope of [
      { scopeType: "workspace" as const, territoryId: null, ownerSub: null },
      ...regions.map((r) => ({
        scopeType: "territory" as const,
        territoryId: r.id,
        ownerSub: null,
      })),
    ]) {
      const range = periodRange(period)!;
      for (const fraction of [0.1, 0.3, 0.5]) {
        const snapshotAt = at(
          period === root
            ? quarterRange.start.getTime()
            : range.start.getTime(),
          Math.min(now.getTime(), range.end.getTime() - 1),
          fraction,
        );
        const snapshot = planSnapshot({
          period,
          scope,
          currency: "CNY",
          snapshotAt,
          opportunities: pool.filter(
            (d) =>
              d.createdAt <= snapshotAt &&
              (!d.closedAt || d.closedAt <= snapshotAt),
          ),
        });
        if (!snapshot.ok) throw new Error("demo_forecast_invalid");
        const key = targetKey(
          scope.scopeType === "workspace"
            ? "workspace"
            : "territory:" + scope.territoryId,
          period,
        );
        const target = first.targets.find((t) => t.key === key)!;
        snapshots.push({
          ...snapshot.value,
          id: id(
            workspaceId,
            "snapshot|" + year + "|" + period + "|" + key + "|" + fraction,
          ),
          workspaceId,
          submittedBySub: reviewer.sub,
          targetBasis: [
            {
              planId,
              metric: "revenue",
              sourceKind: "sales_plan",
              revisionId: revisions[0].id,
              lineKey: key,
              legacyTargetId: null,
              version: 1,
              target: target.target,
              currency: "CNY",
              resolvedAt: snapshotAt.toISOString(),
            },
          ],
        });
      }
    }
  }
  stores.plans.seed([plan]);
  stores.pipeline.seed(deals, { snapshots });
  stores.field.seed({
    interactions: deals.map((d) => ({
      id: id(workspaceId, "interaction|" + d.id),
      workspaceId,
      accountId: d.accountId,
      opportunityId: d.id,
      projectId: null,
      channel: "visit",
      direction: "outbound",
      occurredAt: at(
        d.createdAt.getTime(),
        Math.min(now.getTime(), d.expectedCloseAt!.getTime()),
        0.1,
      ),
      actorSub: d.ownerSub,
      subject: T.followupSubject,
      rawNote: T.followup,
      summary: T.followup,
      captureMode: "manual",
      correctsInteractionId: null,
    })),
  });
  stores.planning.seed({
    targets: [root, quarter].map((period) => ({
      id: id(workspaceId, "personal|" + year + "|" + period),
      workspaceId,
      period,
      scopeType: "owner",
      territoryId: null,
      ownerSub: reviewer.sub,
      metric: "revenue",
      status: "committed",
      targetValue: {
        unit: "money",
        amount: (period === root ? annual : annual / 4) * 0.5,
        currency: "CNY",
      },
      planId: null,
    })),
  });
  if (products.length)
    for (const [i, d] of deals.entries()) {
      await stores.catalog.replaceLines(workspaceId, d.id, [
        {
          productId: products[i % products.length].id,
          solutionId: null,
          quantity: 1,
          unitPrice: d.amount!.amount,
          amount: d.amount!.amount,
          currency: "CNY",
          needsApproval: false,
          customNote: null,
        },
      ]);
    }
}
