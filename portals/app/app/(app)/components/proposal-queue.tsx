"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  BulkActionBar,
  Button,
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  type DataTableColumn,
} from "@vxture/design-ui";
import { TableCard } from "./table-card";
import {
  batchRisk,
  type AgentAction,
  type Decision,
} from "../../domains/copilot/lib/action";
import { isExecutable } from "../../domains/copilot/lib/autonomy";
import { ACTION_STATUS_TONE, confidenceTone } from "../lib/view-model";

import { useMessages } from "../lib/i18n/provider";
// The copilot proposal queue - where a human decides what the agent may do.
//
// ADR-003 named the risk this surface exists to answer: one-at-a-time
// confirmation becomes the bottleneck the moment the agent scores a feed and
// produces hundreds of proposals, and a bottleneck is what makes an organisation
// turn the human step off entirely. So batching is a first-class path here.
//
// What batching must NOT do is weaken accountability, and the design keeps that
// honest in three ways:
//
//   1. Every accepted row still gets its own decided_by_sub. planBatchDecision
//      signs each one; there is no "batch approval" record standing in for the
//      individual ones.
//   2. The confirmation is built from batchRisk(), so the dialog states what is
//      actually being waved through - how many, of what kind, against what, and
//      how many are low-confidence. "Accept 200 items" is exactly the framing
//      that makes bulk approval dangerous.
//   3. Rationale is always visible on the row, never behind a click. A decision
//      made without reading the reasoning is not the human-in-the-loop the rule
//      is asking for.
//
// Every element here is a DS component. The only thing this file adds is the
// binding to yucer's domain semantics.

export interface ProposalQueueProps {
  readonly actions: readonly AgentAction[];
  /** False when the member lacks copilot.decide; the queue becomes read-only. */
  readonly canDecide: boolean;
  /**
   * Sends the SELECTION and the verdict - never a computed patch.
   *
   * The server re-reads each proposal, re-runs both gates and re-plans the
   * decision. If this handed over a patch, a caller could name the decider and
   * sign someone else's name to an approval, which is exactly the record the
   * whole domain exists to keep honest.
   */
  readonly onDecide: (
    ids: string[],
    decision: Decision,
  ) => Promise<{
    ok: boolean;
    error?: string;
    /** Accepted, tried, and refused - see apply(). */
    failed?: ReadonlyArray<{ id: string; reason: string }>;
    /** Accepted, and never attempted because nothing can perform the type. */
    manual?: readonly string[];
  }>;
}

export function ProposalQueue({
  actions,
  canDecide,
  onDecide,
}: ProposalQueueProps) {
  const {
    ACTION_STATUS_LABEL,
    AGENT_ACTION_LABEL,
    AGENT_SUBJECT_LABEL,
    DATA_TABLE_LABELS,
    DS_LABELS,
    PROPOSAL_TEXT,
    PROPOSAL_ERROR,
  } = useMessages();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Only pending proposals are selectable. A decided one is history.
  const pending = useMemo(
    () => actions.filter((a) => a.status === "proposed"),
    [actions],
  );
  const selectedActions = useMemo(
    () => pending.filter((a) => selected.has(a.id)),
    [pending, selected],
  );
  const risk = useMemo(() => batchRisk(selectedActions), [selectedActions]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === pending.length
        ? new Set()
        : new Set(pending.map((a) => a.id)),
    );
  }

  async function apply(decision: Decision) {
    // The result used to be discarded, so a refused adjudication cleared the
    // selection and closed the dialog exactly like a successful one. The two
    // outcomes must not be indistinguishable (TD-010 sweep).
    setNotice(null);
    const r = await onDecide(
      selectedActions.map((a) => a.id),
      decision,
    );
    // A PARTIAL SUCCESS IS NOT A SUCCESS AND NOT A FAILURE, and saying nothing
    // would be the worst of the three. Since 2026-09-01 accepting also carries
    // the action out, so "ok" can mean "signed for, and one of them did not
    // happen" - the queue empties either way, and without this line the deal
    // that did not move is a thing the reader would have to go and notice.
    //
    // The COUNT and the FIRST REASON, not a list: the row itself now says
    // `failed`, so this is the nudge to look rather than the report.
    if (!r.ok) {
      setError(PROPOSAL_ERROR[r.error ?? "denied"] ?? PROPOSAL_ERROR.not_found);
    } else if (r.failed && r.failed.length > 0) {
      // A REAL ATTEMPT THAT WAS REFUSED - reported first, because it is the
      // one that needs looking at.
      const reason = PROPOSAL_ERROR[r.failed[0].reason] ?? PROPOSAL_ERROR.not_found;
      setError(PROPOSAL_TEXT.executionFailed(r.failed.length, reason));
    } else if (r.manual && r.manual.length > 0) {
      // NOT AN ERROR, and it does not pretend to be: these were accepted and
      // nothing was attempted, so the row stays `accepted` rather than being
      // ended as `failed`. The reader still has to know a person now owes the
      // work.
      setNotice(PROPOSAL_TEXT.acceptedForManual(r.manual.length));
      setError(null);
    } else {
      setError(null);
    }
    setSelected(new Set());
    setConfirming(null);
  }

  const columns: readonly DataTableColumn<AgentAction>[] = [
    {
      id: "action",
      header: PROPOSAL_TEXT.columnAction,
      // LABELLED. This printed the raw action_type, so a Chinese table proposed
      // `advance_stage` - and action_type is an open vocabulary (bare
      // VARCHAR(64), no CHECK), so the map cannot be exhaustive and the raw
      // value is the fallback rather than a blank.
      // AND WHETHER ACCEPTING WILL DO IT. Since 2026-09-01 accepting performs
      // the action, and for some types it cannot - `draft_outreach` has no
      // handler on purpose, because a sent message cannot be unsent. Those
      // proposals are still worth accepting; the agreement is recorded and a
      // person does the work. Saying so on the row is what keeps one button
      // from meaning two different things.
      cell: (row) => (
        <span className="flex flex-col gap-3xs">
          <span className="text-foreground">
            {AGENT_ACTION_LABEL[row.actionType] ?? row.actionType}
          </span>
          {row.status === "proposed" && !isExecutable(row.actionType) ? (
            <Badge variant="secondary">{PROPOSAL_TEXT.manualBadge}</Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: "subject",
      header: PROPOSAL_TEXT.columnSubject,
      // The subject was a badge reading `opportunity / opp_demo` - an English
      // enum next to eight characters of an id. The type is a closed set with a
      // CHECK behind it, so it gets a label; the id stays because it is how a
      // reader tells two proposals on the same kind of thing apart, and it is
      // marked as machine text rather than dressed as a name.
      cell: (row) => (
        <span className="flex flex-col gap-3xs">
          <Badge variant="secondary">
            {AGENT_SUBJECT_LABEL[row.subjectType] ?? row.subjectType}
          </Badge>
          <span className="text-muted-foreground font-mono text-xs">
            {row.subjectId}
          </span>
        </span>
      ),
    },
    {
      id: "rationale",
      // Always on the row, never behind a click: a decision made without reading
      // the reasoning is not human-in-the-loop.
      header: PROPOSAL_TEXT.columnRationale,
      cell: (row) => row.rationale ?? "-",
    },
    {
      id: "confidence",
      header: PROPOSAL_TEXT.columnConfidence,
      align: "center",
      cell: (row) => (
        <StatusBadge tone={confidenceTone(row.confidence)}>
          {row.confidence == null
            ? PROPOSAL_TEXT.confidenceMissing
            : `${row.confidence}%`}
        </StatusBadge>
      ),
    },
    {
      id: "status",
      header: PROPOSAL_TEXT.columnStatus,
      align: "center",
      cell: (row) => (
        <StatusBadge tone={ACTION_STATUS_TONE[row.status]} dot>
          {ACTION_STATUS_LABEL[row.status]}
        </StatusBadge>
      ),
    },
    {
      id: "decided",
      header: PROPOSAL_TEXT.columnDecider,
      cell: (row) =>
        // A null decider on an executed row is the autopilot marker, not missing
        // data - it is how the record says no human signed for this.
        row.status === "executed" && !row.decidedBySub ? (
          <StatusBadge tone="warning">
            {PROPOSAL_TEXT.autopilotMarker}
          </StatusBadge>
        ) : row.decidedBySub ? (
          <span className="text-muted-foreground font-mono text-xs">
            {row.decidedBySub}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
  ];

  return (
    <Section
      title={PROPOSAL_TEXT.title}
      description={PROPOSAL_TEXT.description}
    >
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {notice ? <StatusBadge tone="info">{notice}</StatusBadge> : null}
      {/* The bar takes data now, not three JSX slots, and returns null itself
          when nothing is selected - so the outer guard is gone. Both bulk
          actions still open the confirmation rather than acting: ADR-003 is
          that a person decides, and a one-click "accept 200" is exactly the
          frictionless path batchRisk() exists to interrupt. */}
      {/* ALL FOUR outlets passed, and the template and the noun move together
          by necessity - the changelog names this pair, because passing only
          the noun yields 「已选择 3 items」. The shipped defaults are English
          ("{count} {noun} selected" / "items" / "Bulk actions" / "Clear");
          note that the .d.ts comments still claim Chinese ones, so this was
          verified against the bundle rather than the types. */}
      <BulkActionBar
        count={selected.size}
        noun={PROPOSAL_TEXT.selectionNoun}
        selectionTemplate={DS_LABELS.bulkSelectionTemplate}
        toolbarLabel={DS_LABELS.bulkToolbar}
        clearLabel={PROPOSAL_TEXT.clearSelection}
        onClear={() => setSelected(new Set())}
        actions={[
          {
            id: "reject",
            label: PROPOSAL_TEXT.bulkReject,
            onSelect: () => setConfirming("reject"),
          },
          {
            id: "accept",
            label: PROPOSAL_TEXT.bulkAccept,
            onSelect: () => setConfirming("accept"),
          },
        ]}
      />

      {confirming ? (
        <BatchConfirm
          decision={confirming}
          risk={risk}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void apply(confirming)}
        />
      ) : null}

      {actions.length === 0 ? (
        <EmptyState
          title={PROPOSAL_TEXT.emptyTitle}
          description={PROPOSAL_TEXT.emptyDescription}
        />
      ) : (
        <TableCard>
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={1}
            columns={columns}
            rows={actions}
            rowKey={(row) => row.id}
            /* SELECTION IS THE DS'S NOW. It was a hand-rolled `select` column
               with two Checkboxes, which landed the boxes AFTER the index
               instead of first - the convention is select, then index, then
               title - and duplicated the select-all logic the DS already has.
               `leadingSpacer` comes off with it: the checkbox column IS the
               leading column once the DS draws it, and keeping both left two
               empty cells before the first number.

               Only a still-proposed row is selectable. A decided one is not a
               thing a batch can act on, and offering a box that does nothing is
               how a reader learns to distrust the boxes. */
            selectedKeys={[...selected]}
            onSelectionChange={(keys) => setSelected(new Set(keys))}
            isRowSelectable={(row) => canDecide && row.status === "proposed"}
          />
        </TableCard>
      )}
    </Section>
  );
}

interface BatchConfirmProps {
  readonly decision: Decision;
  readonly risk: ReturnType<typeof batchRisk>;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * The confirmation states what is actually being waved through. Rendering this
 * as "accept 200 items" is precisely what makes bulk approval dangerous, so the
 * count, the kinds, the targets and the low-confidence share are all named.
 */
function BatchConfirm({
  decision,
  risk,
  onCancel,
  onConfirm,
}: BatchConfirmProps) {
  const { AGENT_ACTION_LABEL, AGENT_SUBJECT_LABEL, PROPOSAL_TEXT } = useMessages();
  const verb =
    decision === "accept" ? PROPOSAL_TEXT.verbAccept : PROPOSAL_TEXT.verbReject;
  return (
    <Section
      tone="default"
      title={PROPOSAL_TEXT.confirmTitle(verb, risk.count)}
      description={PROPOSAL_TEXT.confirmDetail({
        // LABELLED, like the table one row below. This printed the raw enums -
        // a Chinese dialog reading "动作类型：draft_outreach；作用对象：account"
        // directly under a table that says 起草触达 / 客户. The table was fixed
        // for exactly this and the dialog was missed, which is the shape TD-010
        // keeps taking: the value is a key, and the sentence lives in the
        // message table. The raw value stays as the fallback, because
        // action_type is an open vocabulary and no map can be exhaustive.
        actionTypes: PROPOSAL_TEXT.joinLabels(
          risk.actionTypes.map((t) => AGENT_ACTION_LABEL[t] ?? t),
        ),
        subjectTypes: PROPOSAL_TEXT.joinLabels(
          risk.subjectTypes.map((t) => AGENT_SUBJECT_LABEL[t] ?? t),
        ),
        meanConfidence: risk.meanConfidence,
        lowConfidenceCount: risk.lowConfidenceCount,
      })}
      action={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {PROPOSAL_TEXT.cancel}
          </Button>
          {/* destructive-STRONG, not destructive, and that is the DS's own
              distinction rather than a way around the new type obligation.
              This button IS the confirmation - BatchConfirm is the interrupt
              batchRisk() exists to raise - so asking it to raise a second one
              would be a loop, and design-ui 6.0 leaves the strong grade
              unconstrained for exactly that reason: it is the hammer, and a
              hammer does not ask itself. */}
          <Button
            variant={decision === "accept" ? "default" : "destructive-strong"}
            onClick={onConfirm}
          >
            {PROPOSAL_TEXT.confirm(verb)}
          </Button>
        </>
      }
    >
      {decision === "accept" ? (
        <>
          <p>{PROPOSAL_TEXT.acceptNote}</p>
          {/* SAID BEFORE THE CLICK, not after. Accepting performs the action,
              except for the ones it cannot - and which of the two a batch is is
              part of what the person is deciding. */}
          {risk.manualCount > 0 ? (
            <p>{PROPOSAL_TEXT.acceptManualNote(risk.manualCount, risk.count)}</p>
          ) : null}
        </>
      ) : (
        <p>{PROPOSAL_TEXT.rejectNote}</p>
      )}
    </Section>
  );
}
