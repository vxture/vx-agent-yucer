import Link from "next/link";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
  Icon,
  PanelCard,
  PanelList,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { DIRECTION_LABEL, FIELD_TEXT } from "../lib/messages";

// The manager's first screen: promises that have gone past their date.
//
// This is the one derived view stage 1 ships, and it is derived from recorded
// facts only - no model, no score, no interpretation. A promise had a date, the
// date passed, nothing closed it. That is checkable by anyone who disagrees
// with it, which is the property every later judgement has to inherit.
//
// Ordered oldest-first: the promise that has been rotting longest is the one
// worth a phone call, and "sorted by account name" would bury it.
//
// IT USED TO SHOW FOUR ROTTING PROMISES AND OFFER NOTHING TO DO ABOUT ANY OF
// THEM. The whole page carried zero buttons while `settleCommitment` sat wired
// and reachable in field-actions.ts. A list that ranks work by urgency and then
// dead-ends is worse than no list: it teaches the reader that the ranking is
// decoration.
//
// THE VERB IS "GO", NOT "CLOSE", and that is the product's logic rather than a
// shortcut. Settling means deciding whether the promise was met, missed or
// waived, and "met" needs the interaction that proves it. That judgement
// belongs on the account, beside the history it is judged against - and there
// the promise can also be AMENDED, a date moved or an amount corrected, which
// is often the honest answer. A list row knows none of that and would force a
// met-or-missed it has no standing to ask for.
//
// The markup was a bare <ul> with no classes on anything, which is why badges
// and text ran together. It now uses the same row idiom as the signal queue,
// because it is the same kind of object: a thing waiting to be judged.

export interface OverdueRow {
  readonly id: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly direction: string;
  readonly statement: string;
  readonly dueAt: Date;
  readonly ownerSub: string | null;
}

export interface OverdueCommitmentsProps {
  readonly rows: readonly OverdueRow[];
  readonly now?: Date;
}

const DAY = 86_400_000;

export function OverdueCommitments({ rows, now }: OverdueCommitmentsProps) {
  const at = now ?? new Date();

  if (rows.length === 0) {
    return (
      <Section
        icon="warning"
        title={FIELD_TEXT.commitOverdueTitle}
        description={FIELD_TEXT.commitOverdueDescription}
      >
        <EmptyState
          title={FIELD_TEXT.commitOverdueEmpty}
          description={FIELD_TEXT.commitOverdueEmptyDescription}
        />
      </Section>
    );
  }

  return (
    /* PanelCard IS the block - there is no Section wrapping it.
       Wrapping one in the other printed the title and the description TWICE,
       once as the section heading and again as the card's own, because
       PanelCard carries icon + title + description + action + tone by itself.
       A Section earns its keep when it holds several cards, the way the signal
       queue holds three lines of enquiry. Here there is one group, so the card
       is the whole block.

       tone="danger" paints the top edge only. Every row in here is already
       late; the block says so once at its edge rather than making each row
       shout it. */
    <Collapsible defaultOpen>
      <PanelCard
        icon="warning"
        tone="danger"
        title={FIELD_TEXT.commitOverdueTitle}
        description={FIELD_TEXT.commitOverdueDescription}
        action={
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              {FIELD_TEXT.commitCount(rows.length)}
              <Icon name="chevron-down" size="xs" />
            </Button>
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent>
          <PanelList>
            {rows.map((r) => (
              <Row
                key={r.id}
                row={r}
                days={Math.floor((at.getTime() - r.dueAt.getTime()) / DAY)}
              />
            ))}
          </PanelList>
        </CollapsibleContent>
      </PanelCard>
    </Collapsible>
  );
}

function Row({ row: r, days }: { row: OverdueRow; days: number }) {
  return (
    <div className="flex min-w-0 items-start gap-md py-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-xs">
        {/* L1 - who owes it and how late, then the promise itself.
            Days late leads, not the due date: a date makes the reader do the
            subtraction, and the number is the thing the list is ranked on. */}
        <div className="flex min-w-0 items-center gap-lg">
          <span className="flex min-w-0 items-center gap-xs">
            <StatusBadge tone="danger" dot>
              {FIELD_TEXT.commitDaysOverdue(days)}
            </StatusBadge>
            <StatusBadge tone={r.direction === "they_owe" ? "info" : "neutral"}>
              {DIRECTION_LABEL[r.direction] ?? r.direction}
            </StatusBadge>
            <Link
              href={`/account/${r.accountId}`}
              className="text-foreground min-w-0 truncate text-body-md hover:underline"
            >
              {r.accountName}
            </Link>
          </span>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {FIELD_TEXT.commitDueOn(r.dueAt.toISOString().slice(0, 10))}
          </span>
        </div>

        {/* L2 - what was actually promised. This is the sentence someone wrote
            down in the field, so it wraps rather than truncating: a promise cut
            off mid-clause is not checkable, and checkable is the whole point. */}
        <p className="text-muted-foreground max-w-(--vx-container-2xl) text-xs">
          {r.statement}
        </p>

        {/* L3 - who owns it | where to go. */}
        <div className="flex min-w-0 items-start justify-between gap-md">
          <p className="text-muted-foreground min-w-0 truncate text-xs">
            {r.ownerSub
              ? FIELD_TEXT.commitOwner(r.ownerSub)
              : FIELD_TEXT.commitOwnerNone}
          </p>
          <Button size="sm" asChild>
            <Link
              href={`/account/${r.accountId}`}
              title={FIELD_TEXT.commitGoSettleHint(r.accountName)}
            >
              {FIELD_TEXT.commitGoSettle}
              <Icon name="arrow-right" size="xs" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
