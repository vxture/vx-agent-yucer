import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import {
  getAccountStore,
  getCatalogStore,
  getPipelineStore,
} from "../../domains/shared/registry";
import { listOpportunityLines } from "../../domains/catalog/service";
import { listPipeline } from "../../domains/pipeline/service";
import { listAccounts } from "../../domains/account/service";
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

  const [deals, lines, accounts] = await Promise.all([
    listPipeline({ ...base, store: getPipelineStore() }, { includeClosed: true }),
    listOpportunityLines({ ...base, store: getCatalogStore() }),
    // The customer's NAME, through its own gate. listPipeline returns an
    // accountId and an optional accountName it never fills, and /pipeline
    // falls back to printing the id - a UUID in a column headed "customer".
    // A member who cannot read accounts gets a blank here instead, which is
    // the honest answer to "who is this" when you are not allowed to know.
    listAccounts({ ...base, store: getAccountStore() }),
  ]);

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
  const byDeal = new Map<string, { count: number; amount: number; currency: string; unsigned: number }>();
  for (const l of lines.ok ? lines.value : []) {
    const acc = byDeal.get(l.opportunityId) ?? {
      count: 0,
      amount: 0,
      currency: l.currency,
      unsigned: 0,
    };
    acc.count += 1;
    acc.amount += l.amount;
    // Below the floor AND unsigned. needsApproval alone would count lines a
    // human has already signed for, which is the opposite of what blocks.
    if (l.needsApproval && !l.approved) acc.unsigned += 1;
    byDeal.set(l.opportunityId, acc);
  }

  const accountName = new Map(
    (accounts.ok ? accounts.value : []).map((a) => [a.id, a.name]),
  );

  const rows: QuoteRow[] = deals.value
    .filter((d) => byDeal.has(d.id))
    .map((d) => {
      const q = byDeal.get(d.id)!;
      return {
        opportunityId: d.id,
        opportunityNo: d.opportunityNo,
        name: d.name,
        accountName: accountName.get(d.accountId) ?? null,
        stage: d.stage,
        lineCount: q.count,
        amount: q.amount,
        currency: q.currency,
        awaitingSignature: q.unsigned,
      };
    })
    // Blocked quotes first: they are the ones somebody has to act on, and a
    // list sorted by anything else buries them among the finished ones.
    .sort((a, b) => b.awaitingSignature - a.awaitingSignature);

  return (
    <ViewLayout>
      <QuoteTable rows={rows} />
    </ViewLayout>
  );
}
