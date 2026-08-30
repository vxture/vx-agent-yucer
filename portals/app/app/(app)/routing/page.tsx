import { EmptyState, ViewLayout } from "@vxture/design-ui";
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
  const { SHELL_TEXT, LOAD_ERROR } = await getMessages();
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
    listAccounts({ ...base, store: getAccountStore() }),
  ]);

  // The lead -> region hop. A lead knows its account; the account knows its
  // region; the territory covers regions. Nothing joined the three before
  // 0017 gave a territory its regions.
  const regionOf = new Map(
    (accounts.ok ? accounts.value : []).map((a) => [a.id, a.region]),
  );

  const plan = await previewRouting(
    { ...base, store: getSignalStore() },
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
    suggestedOwner: p.outcome.kind === "assigned" ? p.outcome.ownerSub : null,
    basis: p.outcome.kind === "assigned" ? p.outcome.basis : "",
    unroutableReason: p.outcome.kind === "unroutable" ? p.outcome.reason : null,
  }));

  return (
    <ViewLayout>
      <RoutingTable
        rows={rows}
        canAssign={
          can(session.authz, session.entitlement, "signal.lead.upsert", "ui").allowed
        }
        onAssign={applyAssignment}
      />
    </ViewLayout>
  );
}
