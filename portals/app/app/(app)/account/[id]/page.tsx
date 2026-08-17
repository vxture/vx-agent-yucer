import { EmptyState, PageHeader, PageStack, StatusBadge } from "@vxture/design-system";
import { resolveAppSession } from "../../lib/session";
import { ACCOUNT_STATUS_LABEL, SHELL_TEXT } from "../../lib/messages";
import { can } from "../../../authz/decide";
import { getAccountStore, getFieldStore } from "../../../domains/shared/registry";
import { decisionChain, getAccountDetail, recomputeHealth } from "../../../domains/account/service";
import { DecisionChain } from "../../components/decision-chain";
import { HealthPanel } from "../../components/health-panel";
import { LinkContacts } from "../../components/link-contacts";
import { InteractionTimeline } from "../../components/interaction-timeline";
import { CommitmentList } from "../../components/commitment-list";
import { RelationshipEvidencePanel } from "../../components/relationship-evidence";
import { RecordFollowUp } from "../../components/record-follow-up";
import {
  listCommitments,
  listInteractions,
  relationshipEvidence,
} from "../../../domains/account/field-service";
import { CHANNEL_LABEL } from "../../lib/messages";
import { linkAccountContacts, recomputeAccountHealth } from "../actions";
import { addCommitment, recordFollowUp, settleCommitment } from "../field-actions";

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

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAccountStore(),
  };

  // Through the service, not the store. The page holding a store handle is how
  // a URL becomes a way around the entitlement gate that the hidden nav entry
  // only appeared to enforce.
  const detail = await getAccountDetail(ctx, id);
  if (!detail.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={detail.violations.map((v) => v.message).join("; ")}
      />
    );
  }
  const { account, contacts } = detail.value;

  const canWrite = can(session.authz, session.entitlement, "account.upsert", "ui").allowed;

  const fieldCtx = { ...ctx, store: getFieldStore() };
  const now = new Date();
  const [interactions, commitments, evidence] = await Promise.all([
    listInteractions(fieldCtx, { accountId: id, limit: 50 }),
    listCommitments(fieldCtx, { accountId: id }),
    relationshipEvidence(fieldCtx, id, now),
  ]);

  const [health, chain] = await Promise.all([
    // persist:false - see the note above. It still needs the write gate, so a
    // read-only member gets no panel rather than a silently failing one.
    canWrite ? recomputeHealth(ctx, id, { persist: false }) : Promise.resolve(null),
    decisionChain(ctx, id),
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

      {/* What the recorded facts say about this relationship, above the health
          score they are meant to explain. */}
      {evidence.ok ? <RelationshipEvidencePanel evidence={evidence.value} now={now} /> : null}

      {/* Capture first, above everything derived. The page a rep opens after a
          meeting should let them dump it before it asks them to read anything. */}
      <RecordFollowUp
        accountId={id}
        canRecord={canWrite}
        onRecord={recordFollowUp}
      />

      {commitments.ok ? (
        <CommitmentList
          accountId={id}
          items={commitments.value}
          // Only real interactions can close a promise, so the picker is
          // literally the evidence requirement made visible.
          evidence={(interactions.ok ? interactions.value : []).map((i) => ({
            id: i.id,
            label: `${i.occurredAt.toISOString().slice(0, 10)} ${CHANNEL_LABEL[i.channel] ?? i.channel}`,
          }))}
          canWrite={canWrite}
          onCreate={addCommitment}
          onSettle={settleCommitment}
        />
      ) : null}

      {interactions.ok ? <InteractionTimeline items={interactions.value} /> : null}

      {chain.ok ? (
        <DecisionChain
          coverage={chain.value}
          contacts={contacts}
          linkForm={
            <LinkContacts
              accountId={id}
              contacts={contacts}
              canLink={can(session.authz, session.entitlement, "account.graph.link", "ui").allowed}
              unreachable={chain.value.economicBuyerUnreachable}
              onLink={linkAccountContacts}
            />
          }
        />
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
