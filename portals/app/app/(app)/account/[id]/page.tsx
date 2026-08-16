import { EmptyState, PageHeader, PageStack, StatusBadge } from "@vxture/design-system";
import { resolveAppSession } from "../../lib/session";
import { ACCOUNT_STATUS_LABEL, SHELL_TEXT } from "../../lib/messages";
import { can } from "../../../authz/decide";
import { getAccountStore } from "../../../domains/shared/registry";
import { decisionChain, recomputeHealth } from "../../../domains/account/service";
import { DecisionChain } from "../../components/decision-chain";
import { HealthPanel } from "../../components/health-panel";
import { recomputeAccountHealth } from "../actions";

// D4 account detail: health with its reasons, and the decision chain.
//
// Health is computed WITHOUT persisting (persist: false). Opening a page is a
// read, and a page render that writes would mean a member with only account.read
// silently mutating a row by looking at it - and it would put a write on every
// navigation. The button persists; the view does not.

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const store = getAccountStore();
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store,
  };

  const account = await store.getAccount(session.workspaceId, id);
  if (!account) {
    return <EmptyState title={SHELL_TEXT.loadFailed} description={`account ${id} was not found`} />;
  }

  const canWrite = can(session.authz, session.entitlement, "account.upsert", "ui").allowed;

  const [health, chain, contacts] = await Promise.all([
    // persist:false - see the note above. It still needs the write gate, so a
    // read-only member gets no panel rather than a silently failing one.
    canWrite ? recomputeHealth(ctx, id, { persist: false }) : Promise.resolve(null),
    decisionChain(ctx, id),
    store.listContacts(session.workspaceId, id),
  ]);

  return (
    <PageStack>
      <PageHeader
        eyebrow={account.accountNo}
        icon="buildings"
        title={account.name}
        description={[account.industry, account.region].filter(Boolean).join(" / ")}
        actions={
          <StatusBadge tone={account.status === "churned" ? "danger" : "neutral"} dot>
            {ACCOUNT_STATUS_LABEL[account.status] ?? account.status}
          </StatusBadge>
        }
      />

      {health && health.ok ? (
        <HealthPanel
          accountId={id}
          health={health.value}
          canRecompute={canWrite}
          onRecompute={recomputeAccountHealth}
        />
      ) : null}

      {chain.ok ? (
        <DecisionChain coverage={chain.value} contacts={contacts} />
      ) : (
        // account.graph is a pro-tier capability. The page still renders - a
        // starter workspace sees the account without the relationship map.
        <EmptyState
          title={SHELL_TEXT.loadFailed}
          description={chain.violations.map((v) => v.message).join("; ")}
        />
      )}
    </PageStack>
  );
}
