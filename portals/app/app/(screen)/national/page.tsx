import { EmptyState } from "@vxture/design-ui";
import { resolveAppSession } from "../../(app)/lib/session";
import { getMessages } from "../../(app)/lib/i18n/server";
import { can } from "../../authz/decide";
import { listAccounts } from "../../domains/account/service";
import { listPipeline } from "../../domains/pipeline/service";
import { listProjects, projectView } from "../../domains/delivery/service";
import { listLeads } from "../../domains/signal/service";
import { listProposals } from "../../domains/copilot/service";
import { getCopilotStore, getDeliveryStore } from "../../domains/shared/registry";
import type { InstalmentLike, MilestoneLike } from "../lib/rollup";
import { NationalScreen } from "../components/national-screen";

// 全国销售态势屏 - the situation screen, as a page of this product.
//
// THE GATE IS THE SUM OF THE PAGES IT AGGREGATES, and that is the whole design.
// The six panels show leads, deals, contracts, the copilot's queue, delivery and
// collections on one surface; a reader who may see the pipeline but not delivery
// must not learn delivery totals here just because they are rolled up. So it
// asks for every view action that owns a figure on the screen - account.view,
// pipeline.view, delivery.project.view, signal.lead.view, copilot.action.view -
// and refuses unless all five allow. 回款兑现 adds no sixth: the instalments are
// delivery's own data, read through the same project view /collection uses.
//
// NO NEW FEATURE KEY, deliberately. Keys are frozen at 19 (owner, 2026-08-26)
// and this is not separately sellable: it is a way of looking at data the
// workspace already has. Requiring the three existing actions also means the
// screen inherits their ENTITLEMENT gates for free - a workspace whose tier does
// not include delivery cannot see delivery figures on the map either, without a
// single line here knowing what a tier is.
//
// "ui" SURFACE. This is a page render deciding what to draw, not an API serving
// data - the distinction the action catalogue keeps out of the specs on purpose.

export const dynamic = "force-dynamic";

export default async function NationalScreenPage() {
  const { SHELL_TEXT, SCREEN_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = { holder: session.authz, entitlement: session.entitlement };
  const gates = [
    can(ctx.holder, ctx.entitlement, "account.view", "ui"),
    can(ctx.holder, ctx.entitlement, "pipeline.view", "ui"),
    can(ctx.holder, ctx.entitlement, "delivery.project.view", "ui"),
    can(ctx.holder, ctx.entitlement, "signal.lead.view", "ui"),
    can(ctx.holder, ctx.entitlement, "copilot.action.view", "ui"),
  ];
  if (gates.some((g) => !g.allowed)) {
    // ONE REFUSAL, NOT A PARTIAL SCREEN. Rendering the map with delivery blanked
    // out would be a national screen that quietly under-reports, which is worse
    // than a screen that says it cannot be shown.
    return (
      <EmptyState
        title={SCREEN_TEXT.deniedTitle}
        description={SCREEN_TEXT.deniedDescription}
      />
    );
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  /* THE STORES COME OFF THE SESSION, already scoped. Reaching for the registry's
     own getters here would step past the reader's data scope - a national screen
     is exactly where that would be least visible, because a member narrowed to
     one territory would see a whole country and have no way to tell. Delivery
     carries no owner column and so has no scoped wrapper; it takes the registry
     getter like /delivery does. */
  const deliveryCtx = { ...base, store: getDeliveryStore() };
  const [accounts, deals, projects, leads, proposals] = await Promise.all([
    listAccounts({ ...base, store: session.stores.account() }),
    listPipeline({ ...base, store: session.stores.pipeline() }, { includeClosed: true }),
    listProjects(deliveryCtx),
    listLeads({ ...base, store: session.stores.signal() }),
    listProposals({ ...base, store: getCopilotStore() }),
  ]);

  /* THE INSTALMENTS COME OFF THE PROJECT VIEW, one call per project, exactly as
     /collection reads them. It is an N+1 and it is deliberate: the schedule
     lives on the view rather than on the project row, and the alternative is a
     second read path that can disagree with the page a collections review
     actually opens. A project whose view is refused contributes nothing rather
     than a zero - a missing schedule is not an empty one. */
  const instalments: InstalmentLike[] = [];
  const milestones: MilestoneLike[] = [];
  if (projects.ok) {
    const views = await Promise.all(projects.value.map((p) => projectView(deliveryCtx, p.id)));
    views.forEach((v, i) => {
      if (!v.ok) return;
      const projectId = projects.value[i]!.id;
      for (const inst of v.value.instalments) {
        instalments.push({
          id: inst.id,
          projectId,
          status: inst.status,
          plannedAmount: inst.plannedAmount.amount,
          actualAmount: inst.actualAmount?.amount ?? null,
          dueAt: inst.dueAt,
          settledAt: inst.settledAt,
        });
      }
      // 里程碑准点 is measured off the gates, which travel on the same view.
      for (const ms of v.value.milestones) {
        milestones.push({
          id: ms.id,
          projectId,
          status: ms.status,
          dueAt: ms.dueAt,
          completedAt: ms.completedAt,
        });
      }
    });
  }

  /* THE ROWS GO TO THE CLIENT, NOT THE ROLL-UP.
     统计周期 is chosen on the screen, and every figure on it is counted over
     that window, so the aggregation has to be able to run again when the
     window changes. Rolling up here would mean either a round trip per choice
     or six pre-computed copies of every province; the rows themselves are a
     few hundred small objects and re-summing them is instant.

     They are TRIMMED to what the roll-up reads. Shipping the store records
     whole would put commercial detail on the wire that this screen never
     draws - and it is a screen people stand in front of. */
  const rows = {
    accounts: (accounts.ok ? accounts.value : []).map((a) => ({
      id: a.id, province: a.province,
    })),
    deals: (deals.ok ? deals.value : []).map((d) => ({
      id: d.id, accountId: d.accountId, status: d.status,
      amount: d.amount ? { amount: d.amount.amount } : null,
      probability: d.probability, stage: d.stage,
      closedAt: d.closedAt, expectedCloseAt: d.expectedCloseAt,
    })),
    projects: (projects.ok ? projects.value : []).map((p) => ({
      id: p.id, accountId: p.accountId, opportunityId: p.opportunityId,
      status: p.status, health: p.health,
      contractAmount: p.contractAmount ? { amount: p.contractAmount.amount } : null,
    })),
    leads: (leads.ok ? leads.value : []).map((l) => ({
      id: l.id, accountId: l.accountId, status: l.status,
      ownerSub: l.ownerSub, createdAt: l.createdAt,
    })),
    proposals: (proposals.ok ? proposals.value : []).map((a) => ({
      id: a.id, status: a.status, subjectType: a.subjectType,
      subjectId: a.subjectId, createdAt: a.createdAt,
    })),
    instalments,
    milestones,
  };

  return (
    /* THE SUB, not a display name. AuthUser carries no name - the same reason
       the account table renders a monospaced id in its owner column until a
       directory lands. Dressing an id up as a person is the defect that page
       already fixed once. */
    <NationalScreen rows={rows} viewerSub={session.user.sub} />
  );
}
