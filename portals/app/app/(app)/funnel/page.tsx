import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { listSignals, listLeads, workspaceExits } from "../../domains/signal/service";
import { listPipeline } from "../../domains/pipeline/service";
import { listProjects, projectView } from "../../domains/delivery/service";
import { getDeliveryStore } from "../../domains/shared/registry";
import { readFunnel, type StageInput } from "../../domains/shared/funnel";
import type { FunnelStage } from "../../domains/shared/funnel-exit";
import { ModuleHeadline } from "../components/module-headline";
import { FunnelOverview } from "../components/funnel-overview";
import { Tag } from "../components/tag";

// 漏斗总览 - the whole chain in one reading (design_yucer_110 batch E).
//
// WHAT NO OTHER PAGE COULD SAY. Every stage has its own module and each one
// answers about itself; nothing answered "this demand came in, where did it get
// to, and where did it leak". That question is cross-stage by construction -
// which is exactly why the exit reasons went into one table (incr/0033) rather
// than three columns spread across five.
//
// FIVE READS BEHIND FIVE GATES, not one privileged query. A reader who cannot
// see delivery gets a funnel that stops at the opportunity rather than a page
// that quietly used data they are not entitled to - and the stages they cannot
// see report nothing rather than zero, because those are different claims.

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const { FUNNEL_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />
    );
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const signalCtx = { ...base, store: session.stores.signal() };

  const [signals, leads, deals, projects, exits] = await Promise.all([
    listSignals(signalCtx, { limit: 500 }),
    listLeads(signalCtx, { limit: 500 }),
    listPipeline({ ...base, store: session.stores.pipeline() }, { includeClosed: true }),
    listProjects({ ...base, store: getDeliveryStore() }, {}),
    workspaceExits(signalCtx),
  ]);

  // THE MONEY STAGE COSTS A READ PER PROJECT, like the collections page: an
  // instalment lives on the project view rather than on a workspace-wide list.
  // Worth it here because the funnel's last stage is the one the whole chain
  // exists to reach - a funnel that stopped at "delivered" would stop one step
  // before the point.
  let revenueOpen = 0;
  let revenueSettled = 0;
  let revenueWrittenOff = 0;
  if (projects.ok) {
    const views = await Promise.all(
      projects.value.map((p) => projectView({ ...base, store: getDeliveryStore() }, p.id)),
    );
    for (const v of views) {
      if (!v.ok) continue;
      for (const inst of v.value.instalments) {
        if (inst.status === "settled") revenueSettled += 1;
        else if (inst.status === "written_off") revenueWrittenOff += 1;
        else revenueOpen += 1;
      }
    }
  }

  const sig = signals.ok ? signals.value : [];
  const lead = leads.ok ? leads.value : [];
  const opp = deals.ok ? deals.value : [];
  const prj = projects.ok ? projects.value : [];

  // ADVANCED means "moved on to the next stage", and each stage says so in its
  // own vocabulary. Reading them here rather than in the rule keeps the rule
  // free of five status vocabularies it would otherwise have to import.
  const byStage: Record<FunnelStage, StageInput> = {
    signal: {
      open: sig.filter((s) => s.status === "new" || s.status === "scored").length,
      advanced: sig.filter((s) => s.status === "promoted").length,
      exited: sig.filter((s) => s.status === "dismissed" || s.status === "duplicate").length,
    },
    lead: {
      open: lead.filter((l) => l.status !== "converted" && l.status !== "disqualified").length,
      advanced: lead.filter((l) => l.status === "converted").length,
      exited: lead.filter((l) => l.status === "disqualified").length,
    },
    opportunity: {
      open: opp.filter((o) => o.status === "open").length,
      advanced: opp.filter((o) => o.status === "won").length,
      exited: opp.filter((o) => o.status === "lost" || o.status === "abandoned").length,
    },
    project: {
      // A DELIVERED PROJECT HAS NOT LEFT THE FUNNEL - the money has not all
      // arrived. It advanced, and the revenue stage is where it lands.
      open: prj.filter((p) => p.status !== "delivered" && p.status !== "closed" && p.status !== "cancelled").length,
      advanced: prj.filter((p) => p.status === "delivered" || p.status === "closed").length,
      exited: prj.filter((p) => p.status === "cancelled").length,
    },
    revenue: {
      open: revenueOpen,
      // SETTLED IS THE END OF THE CHAIN, so it counts as advanced: there is no
      // sixth stage, and calling it "open" would leave the funnel permanently
      // unfinished.
      advanced: revenueSettled,
      exited: revenueWrittenOff,
    },
  };

  const reading = readFunnel(
    byStage,
    (exits.ok ? exits.value : []).map((e) => ({ stage: e.stage, reasonCode: e.reasonCode })),
  );

  // WHICH STAGES THIS READER COULD NOT SEE. Reported rather than shown as
  // zero: "you may not look at delivery" and "no projects" are different
  // claims, and a funnel that renders the second for the first is lying.
  const blind: FunnelStage[] = [
    ...(signals.ok ? [] : (["signal"] as const)),
    ...(leads.ok ? [] : (["lead"] as const)),
    ...(deals.ok ? [] : (["opportunity"] as const)),
    ...(projects.ok ? [] : (["project", "revenue"] as const)),
  ];

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey="funnel"
        description={FUNNEL_TEXT.moduleWhy}
        tags={
          <>
            <StatusBadge tone="success">{FUNNEL_TEXT.tagEntered(reading.entered)}</StatusBadge>
            <StatusBadge tone="info">{FUNNEL_TEXT.tagLive(reading.live)}</StatusBadge>
            {/* NOT a warning tone. Which stage loses most is a fact about
                every funnel - one of them always loses most - and colouring it
                as an alarm would make the page shout on every visit. */}
            {reading.biggestLeak ? (
              <Tag>
                {FUNNEL_TEXT.tagLeak(
                  FUNNEL_TEXT.stage[reading.biggestLeak.stage] ?? reading.biggestLeak.stage,
                  reading.biggestLeak.exited,
                )}
              </Tag>
            ) : null}
          </>
        }
      />
      <FunnelOverview reading={reading} blind={blind} />
    </ViewLayout>
  );
}
