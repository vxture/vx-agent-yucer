import Link from "next/link";
import { EmptyState, PageSection, StatusBadge } from "@vxture/design-system";
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
      <PageSection title={FIELD_TEXT.commitOverdueTitle} description={FIELD_TEXT.commitOverdueDescription}>
        <EmptyState title={FIELD_TEXT.commitOverdueEmpty} description={FIELD_TEXT.commitOverdueEmptyDescription} />
      </PageSection>
    );
  }

  return (
    <PageSection title={FIELD_TEXT.commitOverdueTitle} description={FIELD_TEXT.commitOverdueDescription}>
      <ul>
        {rows.map((r) => {
          const days = Math.floor((at.getTime() - r.dueAt.getTime()) / DAY);
          return (
            <li key={r.id}>
              {/* Days late, not the due date. A date makes the reader do the
                  subtraction; the number is the thing being ranked on. */}
              <StatusBadge tone="danger" dot>
                {FIELD_TEXT.commitDaysOverdue(days)}
              </StatusBadge>
              <StatusBadge tone={r.direction === "they_owe" ? "info" : "neutral"}>
                {DIRECTION_LABEL[r.direction] ?? r.direction}
              </StatusBadge>
              <Link href={`/account/${r.accountId}`}>{r.accountName}</Link>
              <span>{r.statement}</span>
              {r.ownerSub ? <span>{r.ownerSub}</span> : null}
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}
