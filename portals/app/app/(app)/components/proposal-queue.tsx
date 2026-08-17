"use client";

import { useMemo, useState } from "react";
import { Badge, BulkActionBar, Button, Checkbox, DataTable, EmptyState, Section, StatusBadge, type DataTableColumn } from "@vxture/design-ui";
import { batchRisk, type AgentAction, type Decision } from "../../domains/copilot/lib/action";
import { ACTION_STATUS_TONE, confidenceTone } from "../lib/view-model";
import { ACTION_STATUS_LABEL, PROPOSAL_TEXT } from "../lib/messages";

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
  readonly onDecide: (ids: string[], decision: Decision) => void | Promise<unknown>;
}

export function ProposalQueue({ actions, canDecide, onDecide }: ProposalQueueProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<Decision | null>(null);

  // Only pending proposals are selectable. A decided one is history.
  const pending = useMemo(() => actions.filter((a) => a.status === "proposed"), [actions]);
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
    setSelected((prev) => (prev.size === pending.length ? new Set() : new Set(pending.map((a) => a.id))));
  }

  async function apply(decision: Decision) {
    await onDecide(selectedActions.map((a) => a.id), decision);
    setSelected(new Set());
    setConfirming(null);
  }

  const columns: readonly DataTableColumn<AgentAction>[] = [
    {
      id: "select",
      header: (
        <Checkbox
          checked={pending.length > 0 && selected.size === pending.length}
          onCheckedChange={toggleAll}
          aria-label={PROPOSAL_TEXT.selectAll}
          disabled={!canDecide || pending.length === 0}
        />
      ),
      cell: (row) => (
        <Checkbox
          checked={selected.has(row.id)}
          onCheckedChange={() => toggle(row.id)}
          aria-label={PROPOSAL_TEXT.selectOne(row.actionType)}
          disabled={!canDecide || row.status !== "proposed"}
        />
      ),
    },
    {
      id: "action",
      header: PROPOSAL_TEXT.columnAction,
      cell: (row) => (
        <div>
          <div>{row.actionType}</div>
          <Badge variant="secondary">
            {row.subjectType} / {row.subjectId.slice(0, 8)}
          </Badge>
        </div>
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
      align: "right",
      cell: (row) => (
        <StatusBadge tone={confidenceTone(row.confidence)}>
          {row.confidence == null ? PROPOSAL_TEXT.confidenceMissing : `${row.confidence}%`}
        </StatusBadge>
      ),
    },
    {
      id: "status",
      header: PROPOSAL_TEXT.columnStatus,
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
          <StatusBadge tone="warning">{PROPOSAL_TEXT.autopilotMarker}</StatusBadge>
        ) : (
          (row.decidedBySub ?? "-")
        ),
    },
  ];

  return (
    <Section
      title={PROPOSAL_TEXT.title}
      description={PROPOSAL_TEXT.description}
    >
      {/* The bar takes data now, not three JSX slots, and returns null itself
          when nothing is selected - so the outer guard is gone. Both bulk
          actions still open the confirmation rather than acting: ADR-003 is
          that a person decides, and a one-click "accept 200" is exactly the
          frictionless path batchRisk() exists to interrupt. */}
      <BulkActionBar
        count={selected.size}
        noun={PROPOSAL_TEXT.selectionNoun}
        onClear={() => setSelected(new Set())}
        actions={[
          { id: "reject", label: PROPOSAL_TEXT.bulkReject, onSelect: () => setConfirming("reject") },
          { id: "accept", label: PROPOSAL_TEXT.bulkAccept, onSelect: () => setConfirming("accept") },
        ]}
      />

      {confirming ? <BatchConfirm decision={confirming} risk={risk} onCancel={() => setConfirming(null)} onConfirm={() => void apply(confirming)} /> : null}

      {actions.length === 0 ? (
        <EmptyState
          title={PROPOSAL_TEXT.emptyTitle}
          description={PROPOSAL_TEXT.emptyDescription}
        />
      ) : (
        <DataTable columns={columns} rows={actions} rowKey={(row) => row.id} />
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
function BatchConfirm({ decision, risk, onCancel, onConfirm }: BatchConfirmProps) {
  const verb = decision === "accept" ? PROPOSAL_TEXT.verbAccept : PROPOSAL_TEXT.verbReject;
  return (
    <Section
      tone="default"
      title={PROPOSAL_TEXT.confirmTitle(verb, risk.count)}
      description={PROPOSAL_TEXT.confirmDetail({
        actionTypes: risk.actionTypes.join(", "),
        subjectTypes: risk.subjectTypes.join(", "),
        meanConfidence: risk.meanConfidence,
        lowConfidenceCount: risk.lowConfidenceCount,
      })}
      action={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {PROPOSAL_TEXT.cancel}
          </Button>
          <Button variant={decision === "accept" ? "default" : "destructive"} onClick={onConfirm}>
            {PROPOSAL_TEXT.confirm(verb)}
          </Button>
        </>
      }
    >
      {decision === "accept" ? (
        <p>{PROPOSAL_TEXT.acceptNote}</p>
      ) : (
        <p>{PROPOSAL_TEXT.rejectNote}</p>
      )}
    </Section>
  );
}
