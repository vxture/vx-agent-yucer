import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import {
  getAccountStore,
  getCatalogStore,
  getPipelineStore,
} from "../../domains/shared/registry";
import { listOpportunityLines, listPrices, type ApprovedLine } from "../../domains/catalog/service";
import { listComparison } from "../../domains/catalog/lib/pricing";
import { listPipeline, listStageDefinitions } from "../../domains/pipeline/service";
import { toStageCatalog } from "../../domains/pipeline/store";
import { DEFAULT_STAGE_DEFINITIONS } from "../../domains/pipeline/lib/stage";
import { importanceScheme, listAccounts } from "../../domains/account/service";
import { accountLevelOf, medalOf } from "../../domains/account/lib/importance";
import { QuoteTable, type QuoteRow } from "../components/quote-table";
import { loadFailureText } from "../lib/load-failure";

// D6 quotes - the assembly the machinery was missing.
//
// Every part of a quote already existed: opportunity_line carries quantity,
// unit price, amount and needs_approval; price_book_entry carries the floor
// those were judged against; line_discount_approval carries the signature.
// listOpportunityLines already joins the first and the last, precisely so no
// caller can show "needs approval" without knowing whether it was granted.
//
// What was missing was a place where all of it is true AT ONCE, across deals.
// A quote modelled as its own row would have been two records of one offer
// that can disagree - and the line is the record the discount rule reads.
//
// Deals with no lines are absent rather than shown at zero: an opportunity
// nobody has priced has not been quoted, and a row of dashes would say it had.

export const dynamic = "force-dynamic";

export default async function QuotePage() {
  const { LOAD_ERROR, QUOTE_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const [deals, lines, accounts, stageRows, prices, scheme] = await Promise.all([
    listPipeline(
      { ...base, store: session.stores.pipeline() },
      { includeClosed: true },
    ),
    listOpportunityLines({ ...base, store: getCatalogStore() }),
    // The customer's NAME, through its own gate. listPipeline returns an
    // accountId and an optional accountName it never fills, and /pipeline
    // falls back to printing the id - a UUID in a column headed "customer".
    // A member who cannot read accounts gets a blank here instead, which is
    // the honest answer to "who is this" when you are not allowed to know.
    listAccounts({ ...base, store: session.stores.account() }),
    listStageDefinitions({ ...base, store: session.stores.pipeline() }),
    // 原价 reads the price book through its own gate: a member who may see
    // deals but not the book gets a blank 原价 column, not a guessed one.
    listPrices({ ...base, store: getCatalogStore() }),
    // The customer's level (级别徽章), from the same scheme the customer page
    // and the priority matrix read. Refused = no badge, never a guess.
    importanceScheme({ ...base, store: session.stores.account() }),
  ]);
  const stageDefinitions = stageRows.ok ? toStageCatalog(stageRows.value) : DEFAULT_STAGE_DEFINITIONS;

  if (!deals.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(deals.violations, LOAD_ERROR)}
      />
    );
  }

  // Grouped here rather than by a second query: the lines come back joined to
  // their approvals, and asking the database again per deal would be one
  // round trip per row to re-derive what is already in hand.
  const linesByDeal = new Map<string, ApprovedLine[]>();
  for (const l of lines.ok ? lines.value : []) {
    const list = linesByDeal.get(l.opportunityId);
    if (list) list.push(l);
    else linesByDeal.set(l.opportunityId, [l]);
  }

  const accountById = new Map((accounts.ok ? accounts.value : []).map((a) => [a.id, a] as const));
  const levelOf = (accountId: string) => {
    const a = accountById.get(accountId);
    if (!a || !scheme.ok) return null;
    const level = accountLevelOf(a, scheme.value.account);
    return level ? { name: level.name, medal: medalOf(level.rank) } : null;
  };

  const rows: QuoteRow[] = deals.value
    .filter((d) => linesByDeal.has(d.id))
    .map((d) => {
      const own = linesByDeal.get(d.id)!;
      const amount = Math.round(own.reduce((n, l) => n + l.amount, 0) * 100) / 100;
      const list = prices.ok ? listComparison(own, prices.value) : null;
      return {
        opportunityId: d.id,
        opportunityNo: d.opportunityNo,
        name: d.name,
        accountId: d.accountId,
        accountName: accountById.get(d.accountId)?.name ?? null,
        accountLevel: levelOf(d.accountId),
        stage: d.stage,
        lineCount: own.length,
        amount,
        currency: own[0]!.currency,
        listAmount: list?.listAmount ?? null,
        discount: list?.discount ?? null,
        unpriced: list?.unpriced ?? 0,
        // Below the floor AND unsigned. needsApproval alone would count lines
        // a human has already signed for, which is the opposite of what blocks.
        awaitingSignature: own.filter((l) => l.needsApproval && !l.approved).length,
      };
    })
    // Blocked quotes first: they are the ones somebody has to act on, and a
    // list sorted by anything else buries them among the finished ones.
    .sort((a, b) => b.awaitingSignature - a.awaitingSignature);

  return (
    <ViewLayout>
      {/* NO FOLD: a quote's only partition is its approval state, and the
          table below carries it per row. */}
      <ModuleHeadline
        moduleKey="quote"
        description={QUOTE_TEXT.why}
        tags={<StatusBadge tone="success">{QUOTE_TEXT.tagCount(rows.length)}</StatusBadge>}
      />
      <QuoteTable rows={rows} stageDefinitions={stageDefinitions} />
    </ViewLayout>
  );
}
