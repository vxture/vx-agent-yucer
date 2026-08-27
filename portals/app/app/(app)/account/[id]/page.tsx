import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  EmptyState,
  StatusBadge,
  ViewHeader,
  ViewLayout,
} from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import Link from "next/link";
import { can } from "../../../authz/decide";
import {
  getAccountStore,
  getFieldStore,
} from "../../../domains/shared/registry";
import {
  accountRelations,
  decisionChain,
  getAccountDetail,
  recomputeHealth,
} from "../../../domains/account/service";
import { DecisionChain } from "../../components/decision-chain";
import { ChainRecencyPanel } from "../../components/chain-recency";
import { HealthPanel } from "../../components/health-panel";
import { LinkContacts } from "../../components/link-contacts";
import { InteractionTimeline } from "../../components/interaction-timeline";
import { CommitmentList } from "../../components/commitment-list";
import { RelationshipEvidencePanel } from "../../components/relationship-evidence";
import { RecordFollowUp } from "../../components/record-follow-up";
import {
  listCommitments,
  listInteractions,
  chainRecency,
  relationshipEvidence,
} from "../../../domains/account/field-service";
import { getMessages } from "../../lib/i18n/server";
import type { Stage } from "../../../domains/pipeline/lib/stage";
import { listPipeline } from "../../../domains/pipeline/service";
import { listProjects } from "../../../domains/delivery/service";
import { listProposals } from "../../../domains/copilot/service";
import {
  getCopilotStore,
  getDeliveryStore,
  getPipelineStore,
} from "../../../domains/shared/registry";
import { cachedFeed } from "../../lib/board";
import { TheatreRoster } from "../../components/theatre-roster";
import { TheatrePlan } from "../../components/theatre-plan";
import { DesignateAccount } from "../../components/designate-account";
import { designateAccountTier } from "../actions";
import { DEFAULT_PERIOD } from "../../lib/periods";
import { linkAccountContacts, recomputeAccountHealth } from "../actions";
import {
  addCommitment,
  recordFollowUp,
  settleCommitment,
} from "../field-actions";

// D4 account detail: health with its reasons, and the decision chain.
//
// Health is computed WITHOUT persisting (persist: false). Opening a page is a
// read, and a page render that writes would mean a member with only account.read
// silently mutating a row by looking at it - and it would put a write on every
// navigation. The button persists; the view does not.

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const {
    ACCOUNT_STATUS_LABEL,
    ACCOUNT_TEXT,
    AGENT_ACTION_LABEL,
    BOARD_TEXT,
    CHANNEL_LABEL,
    PROJECT_HEALTH_LABEL,
    SHELL_TEXT,
    STAGE_LABEL,
  } = await getMessages();
  const { id } = await params;
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
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

  const canWrite = can(
    session.authz,
    session.entitlement,
    "account.upsert",
    "ui",
  ).allowed;

  const fieldCtx = { ...ctx, store: getFieldStore() };
  const now = new Date();
  const [interactions, commitments, evidence] = await Promise.all([
    listInteractions(fieldCtx, { accountId: id, limit: 50 }),
    listCommitments(fieldCtx, { accountId: id }),
    relationshipEvidence(fieldCtx, id, now),
  ]);

  const [health, chain, relations] = await Promise.all([
    // persist:false - see the note above. It still needs the write gate, so a
    // read-only member gets no panel rather than a silently failing one.
    canWrite
      ? recomputeHealth(ctx, id, { persist: false })
      : Promise.resolve(null),
    decisionChain(ctx, id),
    accountRelations(ctx, id),
  ]);

  // THE POSITIONS ON THIS THEATRE, and the theatre-level plan over them.
  //
  // A page about an account that cannot say which pursuits are running on it is
  // the one thing it most owes its reader - and it could not, until
  // OpportunityFilter gained accountId. Each list links onward: the chain
  // 战略 -> 战役 -> 信号 -> 线索 -> 商机 -> 交付 has to be walkable in both
  // directions, and an account that only ever receives links is a dead end in
  // the middle of it.
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const [deals, projects, feed, proposals] = await Promise.all([
    listPipeline({ ...base, store: getPipelineStore() }, { accountId: id }),
    listProjects({ ...base, store: getDeliveryStore() }, { accountId: id }),
    cachedFeed(base),
    listProposals(
      { ...base, store: getCopilotStore() },
      { status: "proposed" },
    ),
  ]);

  const rosterDeals = (deals.ok ? deals.value : []).map((d) => ({
    id: d.id,
    name: d.name,
    stageLabel: STAGE_LABEL[d.stage as Stage] ?? d.stage,
    amount: d.amount?.amount ?? null,
    currency: d.currency,
  }));
  const rosterProjects = (projects.ok ? projects.value : []).map((pr) => ({
    id: pr.id,
    name: pr.name,
    healthLabel: PROJECT_HEALTH_LABEL[pr.health] ?? pr.health,
    healthTone: (pr.health === "green"
      ? "success"
      : pr.health === "amber"
        ? "warning"
        : "danger") as "success" | "warning" | "danger",
  }));

  // THEATRE-LEVEL proposals: those whose subject is this account. A proposal
  // about one of its deals belongs on that deal's page - mixing them here would
  // ask a reader to sign a tactical move from a page about a relationship.
  const planProposals = (proposals.ok ? proposals.value : [])
    .filter((a) => a.subjectId === id)
    .map((a) => ({
      id: a.id,
      title: AGENT_ACTION_LABEL[a.actionType] ?? a.actionType,
      group:
        BOARD_TEXT.capabilityLabels[a.capability ?? ""] ??
        BOARD_TEXT.capUnlabelled,
      rationale: a.rationale,
      confidence: a.confidence,
    }));

  // A second analysis over the same graph: who has actually been in a recorded
  // room. Deliberately not folded into `chain` - see chain-recency.tsx.
  const recency = relations.ok
    ? await chainRecency(fieldCtx, id, contacts, relations.value, { now })
    : null;

  return (
    <ViewLayout>
      {/* THE WAY BACK. With the board gone this page offers no navigation of
          its own, and returning to the list you came from is the most common
          next action - the shell no longer covers it, so the page must. */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/account">
              {ACCOUNT_TEXT.backToList}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{account.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <ViewHeader
        secondary={account.accountNo}
        icon="buildings"
        title={account.name}
        description={[account.industry, account.region]
          .filter(Boolean)
          .join(" / ")}
        action={
          <StatusBadge
            tone={account.status === "churned" ? "danger" : "neutral"}
            dot
          >
            {ACCOUNT_STATUS_LABEL[account.status] ?? account.status}
          </StatusBadge>
        }
      />

      {/* THE THEATRE, IN THREE LAYERS.

          A page about an account is not a record card. It is where a
          multi-year relationship is commanded from, and the three things it
          owes a reader are what is HERE, how it STANDS, and what to do NEXT.

          LEFT is the dossier and the roster - facts that do not need reading,
          and the positions being fought. It is the answer to "what is on this
          theatre", and it is stable enough to sit still while the middle
          column is worked through.

          CENTRE is one chain of reasoning, top to bottom: the judgement, then
          the evidence it rests on, then the plan drawn from both. That order is
          the argument. A plan read before its evidence is a plan signed on
          trust, and ADR-003 exists because the frictionless path is the
          dangerous one.

          RIGHT is the shell's deck, already anchored to this account.

          xl:grid-cols-[20rem_1fr], not lg: this grid sits in a pane of viewport
          minus a fixed 400px deck and 80px of insets, so at lg the pane is 544
          and a 320px column would leave 190 for everything else. */}
      <div className="grid gap-lg xl:grid-cols-[20rem_1fr]">
        <div className="flex min-w-0 flex-col gap-lg">
          <TheatreRoster deals={rosterDeals} projects={rosterProjects} />

          {/* Who is on this theatre. The chart and the reachability verdict,
              beside the roster rather than buried below the evidence: knowing
              the economic buyer is untouched changes how every number in the
              middle column reads. */}
          {chain.ok ? (
            <DecisionChain
              coverage={chain.value}
              contacts={contacts}
              linkForm={
                <LinkContacts
                  accountId={id}
                  contacts={contacts}
                  canLink={
                    can(
                      session.authz,
                      session.entitlement,
                      "account.graph.link",
                      "ui",
                    ).allowed
                  }
                  unreachable={chain.value.economicBuyerUnreachable}
                  onLink={linkAccountContacts}
                />
              }
            />
          ) : (
            // account.graph is a pro-tier capability. The page still renders -
            // a starter workspace sees the account without the relationship map.
            <EmptyState
              title={SHELL_TEXT.loadFailed}
              description={chain.violations.map((v) => v.message).join("; ")}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-lg">
          {/* 1. HOW IT STANDS. */}
          {health && health.ok ? (
            <HealthPanel
              accountId={id}
              health={health.value}
              canRecompute={canWrite}
              onRecompute={recomputeAccountHealth}
            />
          ) : null}

          {evidence.ok ? (
            <RelationshipEvidencePanel evidence={evidence.value} now={now} />
          ) : null}

          {/* 2. WHAT IT RESTS ON. Promises first: a broken one is the single
                 hardest fact in this section, and the timeline is where it can
                 be checked. */}
          {commitments.ok ? (
            <CommitmentList
              accountId={id}
              items={commitments.value}
              // Only real interactions can close a promise, so the picker is
              // literally the evidence requirement made visible.
              evidence={(interactions.ok ? interactions.value : []).map(
                (i) => ({
                  id: i.id,
                  label: `${i.occurredAt.toISOString().slice(0, 10)} ${CHANNEL_LABEL[i.channel] ?? i.channel}`,
                }),
              )}
              canWrite={canWrite}
              onCreate={addCommitment}
              onSettle={settleCommitment}
            />
          ) : null}

          {recency?.ok ? (
            <ChainRecencyPanel
              recency={recency.value}
              nameOf={(c) => contacts.find((x) => x.id === c.id)?.name ?? c.id}
            />
          ) : null}

          {interactions.ok ? (
            <InteractionTimeline items={interactions.value} limit={5} />
          ) : null}

          {/* 3. WHAT TO DO NEXT - last, because it is drawn from the two
                 layers above it. */}
          <TheatrePlan proposals={planProposals} />

          {/* LAST, after the plan the copilot proposes. Designating a tier is a
              decision about how the team will spend a year on this customer,
              and it reads better as the conclusion of the page than as a
              setting at the top of it. */}
          <DesignateAccount
            accountId={id}
            tier={detail.value.account.tier}
            /* The default period, not a picker. A plan is written for the
               current quarter; choosing a different one is a different action
               and there is no surface for it yet. */
            period={DEFAULT_PERIOD}
            canWrite={
              can(session.authz, session.entitlement, "account.upsert", "ui")
                .allowed
            }
            onDesignate={designateAccountTier}
          />
        </div>
      </div>
    </ViewLayout>
  );
}
