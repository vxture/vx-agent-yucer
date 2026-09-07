import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import {
  getAccountStore,
  getPlanningStore,
  getSignalStore,
} from "../../domains/shared/registry";
import { previewRouting } from "../../domains/signal/service";
import { listTerritories } from "../../domains/planning/service";
import { listAccounts } from "../../domains/account/service";
import { RoutingTable, type RoutingRow } from "../components/routing-table";
import { RoutingAnalysis } from "../components/routing-analysis";
import { ModuleHeadline, type HeadlineStat } from "../components/module-headline";
import { routingStats } from "../../domains/signal/lib/routing-stats";
import { applyAssignment } from "./actions";
import { loadFailureText } from "../lib/load-failure";

// D5 lead routing - territory first, then load.
//
// The owner's ruling of 2026-08-30, and the order is the whole rule: territory
// decides who is ALLOWED to work a lead, load decides which of them SHOULD.
// Reversed, an idle rep gets ground they have never worked; territory alone
// piles everything on one owner.
//
// A PREVIEW WITH PER-ROW APPLY, not a router that ran. Assignment moves work
// between people, and the case somebody must see before it lands is exactly
// the one where the rule answers badly - a territory nobody finished
// configuring, a region no territory covers. Those rows stay in the list
// rather than being filtered: they are what needs fixing in the map.
//
// Three reads, three gates. A member who cannot see territories gets no
// suggestions rather than suggestions computed from a partial map - a router
// that silently used half the ground would assign by accident.

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  const { LOAD_ERROR, ROUTING_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const [territories, accounts] = await Promise.all([
    listTerritories({ ...base, store: getPlanningStore() }),
    listAccounts({ ...base, store: session.stores.account() }),
  ]);

  // The lead -> region hop. A lead knows its account; the account knows its
  // region; the territory covers regions. Nothing joined the three before
  // 0017 gave a territory its regions.
  const regionOf = new Map(
    (accounts.ok ? accounts.value : []).map((a) => [a.id, a.region]),
  );

  const plan = await previewRouting(
    { ...base, store: session.stores.signal() },
    territories.ok ? territories.value : [],
    regionOf,
  );

  if (!plan.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(plan.violations, LOAD_ERROR)}
      />
    );
  }

  const rows: RoutingRow[] = plan.value.map((p) => ({
    leadId: p.leadId,
    leadNo: p.leadNo,
    companyName: p.companyName,
    currentOwner: p.currentOwner,
    region: p.region,
    suggestedOwner: p.outcome.kind === "assigned" ? p.outcome.ownerSub : null,
    basis: p.outcome.kind === "assigned" ? p.outcome.basis : null,
    unroutableReason: p.outcome.kind === "unroutable" ? p.outcome.reason : null,
  }));

  // 统计为主，列表为具体清单 (owner, 2026-09-06) - and both are computed from
  // the SAME rows, so the block and the list cannot disagree.
  const stats = routingStats(rows);

  // THE HEADER STRIP FOLLOWS THE COLLECTIONS TEMPLATE (owner, 2026-09-06 - see
  // design_yucer_100 "模块头部统计条"): a segmented bar over the numbers it
  // names, a percentage beside each figure, a colour dot tying each cell to
  // its share.
  //
  // THE ORDER IS THE MANAGEMENT VIEW, the same reading the other two modules
  // take: what is SETTLED, what is WAITING on somebody, what is STUCK. It is
  // also, here, the order of how much work each one is - which is why 待分配
  // sits in the middle rather than first: a queue is read to find what is
  // broken, and the broken end should be where the eye lands last and stays.
  //
  // 无法分配 LEAVES THE DEPTH RAMP for a warning tone. It is not one more step
  // along the same road - it is the territory map having a hole in it, and it
  // should be found without comparing shades.
  const DISPOSITION_DEPTH = { settled: 3, pending: 1, blocked: 1 } as const;
  const stats$: HeadlineStat[] = stats.byDisposition.map((b) => ({
    key: b.key,
    name: ROUTING_TEXT.disposition[b.key] ?? b.key,
    value: b.count,
    note: ROUTING_TEXT.dispositionWhy[b.key] ?? "",
    depth: DISPOSITION_DEPTH[b.key as keyof typeof DISPOSITION_DEPTH],
    ...(b.key === "blocked" ? { tone: "warning" as const } : {}),
  }));

  return (
    <ViewLayout>
      <ModuleHeadline
        moduleKey="routing"
        description={ROUTING_TEXT.why}
        tags={
          <>
            <StatusBadge tone="success">{ROUTING_TEXT.tagOpen(stats.total)}</StatusBadge>
            {stats.pending > 0 ? (
              <StatusBadge tone="warning">{ROUTING_TEXT.tagPending(stats.pending)}</StatusBadge>
            ) : null}
            {stats.blocked > 0 ? (
              <StatusBadge tone="danger">{ROUTING_TEXT.tagBlocked(stats.blocked)}</StatusBadge>
            ) : null}
          </>
        }
        stats={stats$}
        share
        emptyNote={ROUTING_TEXT.statEmpty}
      />

      <RoutingAnalysis stats={stats} />

      <RoutingTable
        rows={rows}
        canAssign={
          can(session.authz, session.entitlement, "signal.lead.upsert", "ui")
            .allowed
        }
        onAssign={applyAssignment}
      />
    </ViewLayout>
  );
}
