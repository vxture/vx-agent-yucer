"use client";

import { useState } from "react";
import { PageHeader, PageStack, Separator } from "@vxture/design-system";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { subscribeUrl } from "../../entitlement/deeplink";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
// The pure decision module, not authz/context.ts - see the note there.
import type { PermissionHolder } from "../../authz/decide";
import { resolveNavigation } from "../../(app)/lib/navigation";
import { DomainNav } from "../../(app)/components/domain-nav";
import { PipelineBoard, type PipelineRow } from "../../(app)/components/pipeline-board";
import { ProposalQueue } from "../../(app)/components/proposal-queue";
import type { AgentAction } from "../../domains/copilot/lib/action";
import { money } from "../../domains/shared/money";
import { PREVIEW_FIXTURES, PREVIEW_TEXT } from "../../(app)/lib/messages";

// Offline product preview, following the same pattern as the entitlement-matrix
// page: no session, no platform, no database - fixtures only. It exists so the
// domain surfaces can be reviewed and so `next build` actually exercises them
// before the persistence layer lands.
//
// The role and tier pickers are the point: they let a reviewer see the two gates
// behave, side by side, on one screen. Switching to a viewer at the enterprise
// tier shows every domain and no write affordance; dropping to the free tier
// shows the locked entries appear with their upgrade targets named.

export const dynamic = "force-static";

const ROLES: RoleCode[] = [
  "sales_leader",
  "marketing_manager",
  "sales_rep",
  "presales",
  "delivery_manager",
  "sales_ops",
  "viewer",
];

const TIERS = ["free", "starter", "pro", "business", "enterprise"] as const;

const OPPORTUNITIES: PipelineRow[] = [
  {
    id: "opp_1",
    opportunityNo: "OPP-2026-0001",
    name: PREVIEW_FIXTURES.opportunityNames[0],
    accountName: PREVIEW_FIXTURES.accountNames[0],
    stage: "negotiate",
    forecastCategory: "commit",
    amount: money(2_400_000),
    currency: "CNY",
    probability: 90,
    ownerSub: "usr_rep_1",
    territoryId: "t_east",
    expectedCloseAt: new Date("2026-09-30T00:00:00Z"),
  },
  {
    id: "opp_2",
    opportunityNo: "OPP-2026-0002",
    name: PREVIEW_FIXTURES.opportunityNames[1],
    accountName: PREVIEW_FIXTURES.accountNames[1],
    stage: "validate",
    forecastCategory: "best_case",
    // A human-overridden win rate: the stage default at validate is 50.
    probability: 35,
    amount: money(1_150_000),
    currency: "CNY",
    ownerSub: "usr_rep_2",
    territoryId: "t_west",
    expectedCloseAt: new Date("2026-10-15T00:00:00Z"),
  },
  {
    id: "opp_3",
    opportunityNo: "OPP-2026-0003",
    name: PREVIEW_FIXTURES.opportunityNames[2],
    accountName: PREVIEW_FIXTURES.accountNames[2],
    stage: "qualify",
    forecastCategory: "pipeline",
    amount: money(480_000),
    currency: "CNY",
    probability: 10,
    ownerSub: "usr_rep_1",
    territoryId: "t_north",
    expectedCloseAt: new Date("2026-12-01T00:00:00Z"),
  },
  {
    id: "opp_4",
    opportunityNo: "OPP-2026-0004",
    name: PREVIEW_FIXTURES.opportunityNames[3],
    accountName: PREVIEW_FIXTURES.accountNames[3],
    stage: "won",
    forecastCategory: "closed",
    amount: money(760_000),
    currency: "CNY",
    probability: 100,
    ownerSub: "usr_rep_1",
    territoryId: "t_east",
    expectedCloseAt: new Date("2026-07-31T00:00:00Z"),
  },
];

const CREATED = new Date("2026-08-14T02:00:00Z");

const PROPOSALS: AgentAction[] = [
  {
    id: "act_1",
    status: "proposed",
    actionType: "advance_stage",
    subjectType: "opportunity",
    subjectId: "opp_2f4c8a11",
    payload: { to: "propose" },
    rationale: PREVIEW_FIXTURES.rationales[0],
    confidence: 86,
    decidedBySub: null,
    decidedAt: null,
    executedAt: null,
    createdAt: CREATED,
  },
  {
    id: "act_2",
    status: "proposed",
    actionType: "update_forecast_category",
    subjectType: "opportunity",
    subjectId: "opp_9b21ee03",
    payload: { forecastCategory: "best_case" },
    rationale: PREVIEW_FIXTURES.rationales[1],
    confidence: 54,
    decidedBySub: null,
    decidedAt: null,
    executedAt: null,
    createdAt: CREATED,
  },
  {
    id: "act_3",
    status: "proposed",
    actionType: "draft_outreach",
    subjectType: "account",
    subjectId: "acc_77f0c2d5",
    payload: { channel: "email" },
    rationale: PREVIEW_FIXTURES.rationales[2],
    confidence: 41,
    decidedBySub: null,
    decidedAt: null,
    executedAt: null,
    createdAt: CREATED,
  },
  {
    id: "act_4",
    status: "executed",
    actionType: "rescore_signal",
    subjectType: "lead",
    subjectId: "lead_1188aa0f",
    payload: { score: 74 },
    rationale: PREVIEW_FIXTURES.rationales[3],
    confidence: 77,
    // Null decider on an executed row is the autopilot marker.
    decidedBySub: null,
    decidedAt: null,
    executedAt: new Date("2026-08-14T03:10:00Z"),
    createdAt: CREATED,
  },
  {
    id: "act_5",
    status: "rejected",
    actionType: "advance_stage",
    subjectType: "opportunity",
    subjectId: "opp_5510bb77",
    payload: { to: "negotiate" },
    rationale: PREVIEW_FIXTURES.rationales[4],
    confidence: 63,
    decidedBySub: "usr_leader_1",
    decidedAt: new Date("2026-08-14T06:00:00Z"),
    executedAt: null,
    createdAt: CREATED,
  },
];

export default function ProductPreviewPage() {
  const [role, setRole] = useState<RoleCode>("sales_leader");
  const [tier, setTier] = useState<(typeof TIERS)[number] | "none">("pro");
  const [log, setLog] = useState<string[]>([]);

  const entitlement: Entitlement = {
    ...EMPTY_ENTITLEMENT,
    workspace_id: "ws_demo",
    product: "yucer",
    tier: tier === "none" ? null : tier,
    status: tier === "none" ? null : "active",
  };

  const holder: PermissionHolder = { permissions: new Set(permissionsForRoles([role])) };

  const nav = resolveNavigation(holder, entitlement);
  const canDecide = holder.permissions.has("copilot.decide");
  const canWritePipeline = holder.permissions.has("pipeline.write");

  return (
    <PageStack>
      <PageHeader
        eyebrow={PREVIEW_TEXT.eyebrow}
        icon="sparkles"
        title={PREVIEW_TEXT.title}
        description={PREVIEW_TEXT.description}
      />

      <fieldset>
        <legend>{PREVIEW_TEXT.roleLegend}</legend>
        {ROLES.map((r) => (
          <label key={r}>
            <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
            {r}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>{PREVIEW_TEXT.tierLegend}</legend>
        {(["none", ...TIERS] as const).map((t) => (
          <label key={t}>
            <input type="radio" name="tier" checked={tier === t} onChange={() => setTier(t)} />
            {t}
          </label>
        ))}
      </fieldset>

      <Separator />

      <DomainNav
        entries={nav}
        activeKey="pipeline"
        upgradeHref={subscribeUrl({ intent: "upgrade" })}
      />

      <Separator />

      <PipelineBoard rows={OPPORTUNITIES} readOnly={!canWritePipeline} />

      <ProposalQueue
        actions={PROPOSALS}
        canDecide={canDecide}
        onDecide={(ids, decision) =>
          setLog((prev) => [...prev, PREVIEW_TEXT.decisionLog(ids.length, `${decision}: ${ids.join(", ")}`)])
        }
      />

      {log.length > 0 ? (
        <ul>
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
    </PageStack>
  );
}
