import { EmptyState } from "@vxture/design-ui";
import { resolveAppSession } from "../../(app)/lib/session";
import { getMessages } from "../../(app)/lib/i18n/server";
import { SignIn } from "../../(app)/components/sign-in";
import { can } from "../../authz/decide";
import { getAuthzStore } from "../../authz/store";
import { listWorkspaceMembers } from "../../authz/admin";
import { getAuditStore } from "../../audit/lib/store";
import { getCopilotStore } from "../../domains/shared/registry";
import { EnablementScreen } from "../components/enablement-screen";

// 赋能分析 - the copilot's actual use, per person (owner, 2026-09-17).
//
// GATED ON copilot.action.view alone - the existing action that already gates
// seeing the copilot's own proposal queue. No new permission point: this page
// only reads what that one already allows a reader to see (who acted on a
// proposal, and - via the audit table - who asked the copilot to do
// something), so a second gate over the same information would be a lock on
// a door already open to the same person.
//
// A 30-DAY WINDOW, kept local to this page rather than promoted into a shared
// abstraction - the admin usage page this replaces used a rolling 6-week
// window for the same kind of question (how much of X happened recently), so
// "recent" already has local precedent in this codebase; 30 days is simply a
// rounder unit for a page whose own title says "analysis" rather than
// "the last six weeks of Y".

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function EnablementScreenPage() {
  const { ENABLEMENT_TEXT } = await getMessages();
  const session = await resolveAppSession();
  // THE SAME FRONT DOOR AS /national (2026-09-15): this route group drops the
  // app shell entirely, so nothing upstream of this page ever routes a
  // no-session visitor through the shared SignIn screen. See national/page.tsx
  // for the fuller note - the same reasoning applies verbatim here.
  if (!session) {
    return <SignIn />;
  }

  if (!can(session.authz, session.entitlement, "copilot.action.view", "ui").allowed) {
    return (
      <EmptyState
        title={ENABLEMENT_TEXT.title}
        description={ENABLEMENT_TEXT.rankEmpty}
      />
    );
  }

  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const [executedByUser, adoptedByUser, rejectedByUser, expiredTotal, members] = await Promise.all([
    getAuditStore().countByActorSince(session.workspaceId, "copilot.ask", since),
    getCopilotStore().countDecisionsByDeciderSince(session.workspaceId, "accepted", since),
    getCopilotStore().countDecisionsByDeciderSince(session.workspaceId, "rejected", since),
    getCopilotStore().countExpiredSince(session.workspaceId, since),
    listWorkspaceMembers({ ...base, store: getAuthzStore() }),
  ]);

  const nameOf = new Map(
    (members.ok ? members.value : []).map((m) => [m.sub, m.displayName ?? m.sub]),
  );

  // The union of every sub that shows up in ANY of the three per-user counts -
  // a rep who only got a suggestion rejected and never asked the copilot
  // anything themselves still belongs on the adoption panel.
  const subs = new Set([
    ...Object.keys(executedByUser),
    ...Object.keys(adoptedByUser),
    ...Object.keys(rejectedByUser),
  ]);

  const rows = [...subs].map((sub) => ({
    sub,
    name: nameOf.get(sub) ?? sub,
    executed: executedByUser[sub] ?? 0,
    adopted: adoptedByUser[sub] ?? 0,
    rejected: rejectedByUser[sub] ?? 0,
  }));

  const totals = {
    executed: Object.values(executedByUser).reduce((a, b) => a + b, 0),
    adopted: Object.values(adoptedByUser).reduce((a, b) => a + b, 0),
    rejected: Object.values(rejectedByUser).reduce((a, b) => a + b, 0),
    expired: expiredTotal,
  };

  return <EnablementScreen rows={rows} windowDays={WINDOW_DAYS} totals={totals} />;
}
