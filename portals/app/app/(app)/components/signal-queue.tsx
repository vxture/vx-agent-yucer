"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, Icon, Section, SectionHeader, StatusBadge } from "@vxture/design-ui";
import type { SignalRecord } from "../../domains/signal/store";
import { SIGNAL_STATUS_LABEL, SIGNAL_TEXT, SIGNAL_TYPE_LABEL } from "../lib/messages";
import { confidenceTone } from "../lib/view-model";

// The detective's queue.
//
// GROUPED BY LINE OF ENQUIRY, not sorted by score alone. ADR-016 puts targeting
// on the signal precisely so the inbox can be ordered by why we were looking,
// and keeps it OUT of the score so aim never decides what is true. The
// untargeted group is therefore shown rather than hidden: aim decides what to
// read first, never what is allowed in.
//
// THE SCORE IS TAKEN APART. It was a bare number, which asks a reader to trust
// an arithmetic they cannot see - the same failure the home screen fixed by
// printing a rule's trigger condition. The breakdown is RECOMPUTED from the
// stored inputs by the same pure rule, so it cannot drift from the definition.
//
// And recomputing has a second payoff: when today's recomputation differs from
// the stored score, the signal has decayed since it was scored. That is worth
// saying out loud rather than silently showing a stale number.
//
// An unmatched signal shows "new logo" and never a blank. An unrecognised
// company is the most valuable thing this domain finds, and rendering it as
// absence would teach people to skip exactly the rows worth reading.

export type SignalAction = "promote" | "dismiss" | "duplicate" | "rescore";

export interface QueueSignal {
  readonly record: SignalRecord;
  /** Recomputed now, from the same inputs the stored score came from. */
  readonly recomputed: number | null;
  readonly baseWeight: number;
  readonly decay: number;
  readonly bonus: number;
  readonly ageDays: number;
}

export interface SignalQueueProps {
  readonly groups: readonly { key: string; title: string; why: string; items: readonly QueueSignal[] }[];
  readonly canTriage: boolean;
  readonly canRescore: boolean;
  readonly onAct: (signalId: string, action: SignalAction) => void | Promise<unknown>;
}

export function SignalQueue({ groups, canTriage, canRescore, onAct }: SignalQueueProps) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string>("");

  function act(id: string, action: SignalAction) {
    setBusyId(id);
    start(() => {
      void Promise.resolve(onAct(id, action)).finally(() => setBusyId(null));
    });
  }

  return (
    /* A named section, like every other block in the product. It was a bare div
       of grouped cards, so the page went from its headline straight into three
       unlabelled panels - the reader had to infer what they were a list OF. */
    <Section icon="lightbulb" title={SIGNAL_TEXT.title} description={SIGNAL_TEXT.description}>
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <Card key={g.key} className="overflow-hidden">
            <div className="border-border border-b px-lg py-md">
              <SectionHeader level={3} title={g.title} description={g.why} />
            </div>
            <div className="flex flex-col">
              {g.items.map((s) => (
                <Row
                  key={s.record.id}
                  signal={s}
                  open={openId === s.record.id}
                  busy={pending && busyId === s.record.id}
                  canTriage={canTriage}
                  canRescore={canRescore}
                  onToggle={() => setOpenId(openId === s.record.id ? "" : s.record.id)}
                  onAct={act}
                />
              ))}
            </div>
          </Card>
        ))}
    </Section>
  );
}

function Row({
  signal: s,
  open,
  busy,
  canTriage,
  canRescore,
  onToggle,
  onAct,
}: {
  signal: QueueSignal;
  open: boolean;
  busy: boolean;
  canTriage: boolean;
  canRescore: boolean;
  onToggle: () => void;
  onAct: (id: string, a: SignalAction) => void;
}) {
  const r = s.record;
  // Five points, not one. A score drifts a little every day by design - decay
  // is continuous - so a one-point threshold flags essentially every row, and a
  // marker that is always on is a marker nobody reads. Five is the point at
  // which re-scoring would actually change where the row sits.
  const stale = s.recomputed !== null && r.score !== null && Math.abs(s.recomputed - r.score) >= 5;

  return (
    <article className="border-border border-b px-lg py-md last:border-b-0">
      <div className="flex min-w-0 items-start gap-md">
        {/* The score leads, because it is what the row is sorted and judged on. */}
        <div className="w-14 shrink-0 text-right">
          <div
            className={[
              "text-heading-4 tabular-nums",
              r.score === null
                ? "text-muted-foreground"
                : confidenceTone(r.score) === "danger"
                  ? "text-destructive"
                  : confidenceTone(r.score) === "warning"
                    ? "text-warning"
                    : "text-success",
            ].join(" ")}
          >
            {r.score ?? "-"}
          </div>
          {/* Deliberately NOT flagged per row. Scores decay continuously, so on
              a dataset of any age most rows are stale and an alarm on two
              thirds of them is noise rather than information. The count is
              stated once at the top and the arithmetic is in the drawer. */}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-xs">
            <Badge variant="outline">{SIGNAL_TYPE_LABEL[r.signalType] ?? r.signalType}</Badge>
            {/* Never a blank: a company we do not recognise is the find. */}
            {r.accountId === null ? (
              <StatusBadge tone="brand">{SIGNAL_TEXT.unmatchedAccount}</StatusBadge>
            ) : null}
            <StatusBadge tone="neutral">{SIGNAL_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
          </div>
          <p className="text-foreground mt-xs max-w-[62ch] text-body-md">{r.subject}</p>
          <p className="text-muted-foreground mt-2xs truncate text-xs">
            {SIGNAL_TEXT.detectedOn(r.detectedAt.toISOString().slice(0, 10), r.sourceRef ?? r.source)}
          </p>
        </div>

        <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>
          {SIGNAL_TEXT.breakdown}
          <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
        </Button>
      </div>

      {/* Actions without expanding: triage is the ordinary move, and only
          checking the arithmetic needs the drawer. */}
      <div className="mt-sm flex flex-wrap items-center gap-xs">
        {canTriage ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => onAct(r.id, "promote")}>
              {SIGNAL_TEXT.promote}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(r.id, "duplicate")}>
              {SIGNAL_TEXT.markDuplicate}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAct(r.id, "dismiss")}>
              {SIGNAL_TEXT.dismiss}
            </Button>
          </>
        ) : null}
        {canRescore ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(r.id, "rescore")}>
            {SIGNAL_TEXT.rescore}
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="bg-muted/40 border-border mt-md rounded-md border p-sm">
          <p className="text-muted-foreground text-xs">
            {SIGNAL_TEXT.scoreExplain(s.baseWeight, s.decay, s.bonus)}
          </p>
          <div className="mt-sm flex flex-wrap gap-lg">
            <Fact label={SIGNAL_TEXT.bdBase} value={String(s.baseWeight)} />
            <Fact label={SIGNAL_TEXT.bdDecay} value={s.decay.toFixed(2)} />
            <Fact label={SIGNAL_TEXT.bdBonus} value={String(s.bonus)} />
            <Fact label={SIGNAL_TEXT.bdAge} value={String(Math.round(s.ageDays))} />
          </div>
          {stale ? (
            <p className="text-warning mt-sm text-xs">
              {SIGNAL_TEXT.staleWhy(r.score ?? 0, s.recomputed ?? 0)}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-foreground text-label-md tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
