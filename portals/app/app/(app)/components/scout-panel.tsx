"use client";

import { useState, useTransition } from "react";
import { Button, Card, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type {
  AccountMatchProposal,
  DuplicateProposal,
  SignalCluster,
} from "../../domains/signal/lib/scout";

// 智探的判断 - what the scout noticed, offered as proposals (design_yucer_110
// batch D).
//
// THREE READINGS THE QUEUE CANNOT MAKE, because the queue is ordered by a
// per-signal score and each row is judged against a number that knows nothing
// about its neighbours:
//
//   判重      this looks like a second report of one already here
//   匹配客户  this report NAMES a customer we already have on file
//   聚合      several open signals point at one company - one story, not three
//
// EVERY ONE PROPOSES AND STOPS (ADR-003). All three are inferences drawn from
// a company NAME, and a name is not an identity (ADR-024) - so the machine
// says what it noticed and a person decides. The cluster has no button at all:
// it is a reading, not an act.

export function ScoutPanel({
  duplicates,
  matches,
  clusters,
  accountNames,
  canTriage,
  onMarkDuplicate,
  onMatch,
}: {
  readonly duplicates: readonly DuplicateProposal[];
  readonly matches: readonly AccountMatchProposal[];
  readonly clusters: readonly SignalCluster[];
  /** account id -> name. A cluster is grouped BY account, so naming it after
   * the first signal's headline would label a customer with one report's
   * wording. */
  readonly accountNames: ReadonlyMap<string, string>;
  readonly canTriage: boolean;
  readonly onMarkDuplicate: (signalId: string) => Promise<{ ok: boolean; error?: string }>;
  readonly onMatch: (
    signalId: string,
    accountId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { SIGNAL_TEXT, SIGNAL_ACTION_ERROR } = useMessages();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Rows leave the list by id once accepted, rather than by re-running the
  // whole analysis: a re-run after every acceptance would reshuffle what is
  // left under the reader's hand.
  const [done, setDone] = useState<readonly string[]>([]);

  const run = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) setDone((d) => [...d, id]);
      else setError(SIGNAL_ACTION_ERROR[r.error ?? "denied"] ?? SIGNAL_ACTION_ERROR.denied);
    });

  const dupes = duplicates.filter((d) => !done.includes(d.duplicateId));
  const unmatched = matches.filter((m) => !done.includes(m.signalId));
  const quiet = dupes.length === 0 && unmatched.length === 0 && clusters.length === 0;

  return (
    <Card className="flex flex-col gap-sm p-lg">
      <span className="text-foreground text-label-lg">{SIGNAL_TEXT.scoutTitle}</span>
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      {quiet ? (
        <p className="text-muted-foreground text-body-sm">{SIGNAL_TEXT.scoutQuiet}</p>
      ) : null}

      {dupes.map((d) => (
        <div
          key={d.duplicateId}
          className="border-border flex flex-col gap-2xs rounded-md border p-sm"
        >
          <span className="text-foreground truncate text-body-sm">{d.subject}</span>
          <span className="text-muted-foreground text-body-sm">
            {SIGNAL_TEXT.scoutDuplicate(d.daysApart)}
          </span>
          {canTriage ? (
            <div>
              <Button size="sm" disabled={pending} onClick={() => run(d.duplicateId, () => onMarkDuplicate(d.duplicateId))}>
                {SIGNAL_TEXT.markDuplicate}
              </Button>
            </div>
          ) : null}
        </div>
      ))}

      {unmatched.map((m) => (
        <div key={m.signalId} className="border-border flex flex-col gap-2xs rounded-md border p-sm">
          <span className="text-foreground truncate text-body-sm">{m.subject}</span>
          <span className="text-muted-foreground truncate text-body-sm">
            {SIGNAL_TEXT.scoutMatch(m.accountName)}
          </span>
          {canTriage ? (
            <div>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(m.signalId, () => onMatch(m.signalId, m.accountId))}
              >
                {SIGNAL_TEXT.scoutMatchAccept}
              </Button>
            </div>
          ) : null}
        </div>
      ))}

      {clusters.length > 0 ? (
        <div className="flex flex-col gap-2xs">
          <span className="text-muted-foreground text-label-sm">{SIGNAL_TEXT.scoutClusters}</span>
          {clusters.map((c) => (
            // NO BUTTON. A cluster is not an act - it is the observation that
            // these rows are one story, and what to do about it is exactly the
            // judgement the reader is here to make.
            <span key={c.key} className="text-muted-foreground text-body-sm">
              {SIGNAL_TEXT.scoutCluster(
                (c.accountId && accountNames.get(c.accountId)) || c.subject,
                c.signalIds.length,
                c.types.length,
              )}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
