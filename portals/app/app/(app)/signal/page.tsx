import { EmptyState, PageStack } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { SHELL_TEXT } from "../lib/messages";
import { getSignalStore } from "../../domains/shared/registry";
import { listLeads, listSignals } from "../../domains/signal/service";
import { can } from "../../authz/decide";
import { SignalInbox } from "../components/signal-inbox";
import { LeadList } from "../components/lead-list";
import { actOnSignal } from "./actions";
import { actOnLead } from "./lead-actions";

// D5 signal inbox.
//
// `canTriage` and `canRescore` only decide which buttons render. Every action
// re-runs both gates on the server, because a disabled button is a courtesy and
// not a control.

export const dynamic = "force-dynamic";

export default async function SignalPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getSignalStore(),
  };

  const [result, leads] = await Promise.all([
    listSignals(ctx, { limit: 100 }),
    listLeads(ctx, { limit: 100 }),
  ]);

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  return (
    <PageStack>
      <SignalInbox
        signals={result.value}
      // Both flags come from the SAME gate the server action re-runs. Naming
      // tiers here would be the product re-deriving a commercial conclusion,
      // and it would drift from the matrix the moment packaging changed.
        canTriage={can(session.authz, session.entitlement, "signal.triage", "ui").allowed}
        canRescore={can(session.authz, session.entitlement, "signal.rescore", "ui").allowed}
        onAct={actOnSignal}
      />
      {/* Leads sit under the inbox because that is the order the chain runs in:
          a signal is promoted into a lead, and a qualified lead converts. */}
      <LeadList
        leads={leads.ok ? leads.value : []}
        canTriage={can(session.authz, session.entitlement, "signal.lead.upsert", "ui").allowed}
        canConvert={can(session.authz, session.entitlement, "signal.lead.convert", "ui").allowed}
        onAct={actOnLead}
      />
    </PageStack>
  );
}
