import { EmptyState } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { SHELL_TEXT } from "../lib/messages";
import { getSignalStore } from "../../domains/shared/registry";
import { listSignals } from "../../domains/signal/service";
import { can } from "../../authz/decide";
import { SignalInbox } from "../components/signal-inbox";
import { actOnSignal } from "./actions";

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

  const result = await listSignals(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getSignalStore(),
    },
    { limit: 100 },
  );

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  return (
    <SignalInbox
      signals={result.value}
      // Both flags come from the SAME gate the server action re-runs. Naming
      // tiers here would be the product re-deriving a commercial conclusion,
      // and it would drift from the matrix the moment packaging changed.
      canTriage={can(session.authz, session.entitlement, "signal.triage", "ui").allowed}
      canRescore={can(session.authz, session.entitlement, "signal.rescore", "ui").allowed}
      onAct={actOnSignal}
    />
  );
}
