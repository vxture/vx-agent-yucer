import { resolveAppSession } from "../../lib/session";
import { can } from "../../../authz/decide";
import { listSignals } from "../../../domains/signal/service";
import { listAccounts } from "../../../domains/account/service";
import {
  clusterByCompany,
  findDuplicates,
  proposeAccountMatches,
} from "../../../domains/signal/lib/scout";
import { AgentCapture } from "../../components/agent-capture";
import { ScoutPanel } from "../../components/scout-panel";
import { markSignalDuplicate, matchSignal } from "../../signal/actions";
import { deckBundle, recordAction } from "../deck-data";

// 商机智探's dock - the assistant, then what the scout noticed.
//
// COMPUTED ON RENDER, unlike 智能分配's proposals which wait for a button. The
// difference is what the answer costs to be wrong: assignment MOVES work
// between people, so somebody asks for it deliberately; these three are
// readings of a list that is already on screen, and none of them changes
// anything until a person presses accept.
//
// A FAILED ACCOUNT READ STILL LEAVES TWO OF THE THREE. Duplicates and clusters
// are derived from the signals alone; only the account match needs the
// customer list, and it simply finds nothing without it - which is the honest
// answer rather than a reason to blank the panel.

export const dynamic = "force-dynamic";

export default async function SignalDeck() {
  const [bundle, session] = await Promise.all([deckBundle(), resolveAppSession()]);
  if (!bundle || !session) return null;

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const capture = (
    <AgentCapture data={bundle.agent} canRecord={bundle.canRecord} onRecord={recordAction("")} />
  );

  const signals = await listSignals({ ...base, store: session.stores.signal() }, { limit: 200 });
  if (!signals.ok) return <div className="flex flex-col gap-sm">{capture}</div>;

  const accounts = await listAccounts({ ...base, store: session.stores.account() });

  const rows = signals.value.map((s) => ({
    id: s.id,
    subject: s.subject,
    signalType: s.signalType,
    accountId: s.accountId,
    detectedAt: s.detectedAt,
    status: s.status,
  }));

  return (
    <div className="flex flex-col gap-sm">
      {capture}
      <ScoutPanel
        duplicates={findDuplicates(rows)}
        matches={proposeAccountMatches(
          rows,
          (accounts.ok ? accounts.value : []).map((a) => ({ id: a.id, name: a.name })),
        )}
        clusters={clusterByCompany(rows)}
        accountNames={
          new Map((accounts.ok ? accounts.value : []).map((a) => [a.id, a.name]))
        }
        canTriage={can(session.authz, session.entitlement, "signal.triage", "ui").allowed}
        onMarkDuplicate={markSignalDuplicate}
        onMatch={matchSignal}
      />
    </div>
  );
}
