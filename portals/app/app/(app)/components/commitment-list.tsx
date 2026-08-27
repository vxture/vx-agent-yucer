"use client";

import { useState, useTransition } from "react";
import {
  Button,
  EmptyState,
  Input,
  Label,
  NativeSelect,
  Section,
  StatusBadge,
  Textarea,
} from "@vxture/design-ui";
import {
  COMMITMENT_DIRECTIONS,
  isOverdue,
} from "../../domains/account/lib/commitment";
import { useMessages } from "../lib/i18n/provider";

// Promises, and the one control that makes them worth recording.
//
// "Mark met" is DISABLED until a follow-up is chosen to prove it. That is not a
// UI nicety - the rule refuses it and so does the database CHECK - but showing
// it as a blocked control with the reason attached is what teaches the
// distinction. A next step its owner can tick off is a to-do list, and a to-do
// list has never diagnosed a stalled deal.
//
// "Mark missed" needs nothing, and that asymmetry is the point: success must be
// evidenced, failure is what happens when nothing does.

export interface CommitmentItem {
  readonly id: string;
  readonly direction: string;
  readonly statement: string;
  readonly dueAt: Date;
  readonly status: string;
  readonly ownerSub: string | null;
}

export interface EvidenceOption {
  readonly id: string;
  readonly label: string;
}

export interface CommitmentListProps {
  readonly accountId: string;
  /** Set when the list is scoped to one deal: promises made in a deal belong to
   * that deal's page, and closing one there must refresh it. */
  readonly opportunityId?: string;
  readonly items: readonly CommitmentItem[];
  /** Interactions that can close one. Empty means nothing can be marked met. */
  readonly evidence: readonly EvidenceOption[];
  readonly canWrite: boolean;
  readonly now?: Date;
  readonly onCreate: (
    accountId: string,
    input: {
      direction: string;
      statement: string;
      dueAt: string;
      opportunityId?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onSettle: (
    accountId: string,
    id: string,
    input: {
      to: string;
      evidenceInteractionId?: string;
      waiveReason?: string;
      opportunityId?: string;
    },
  ) => Promise<{ ok: boolean; error?: string }>;
}

const DAY = 86_400_000;

export function CommitmentList({
  accountId,
  opportunityId,
  items,
  evidence,
  canWrite,
  now,
  onCreate,
  onSettle,
}: CommitmentListProps) {
  const { COMMIT_STATUS_LABEL, DIRECTION_LABEL, FIELD_ERROR, FIELD_TEXT } =
    useMessages();
  const at = now ?? new Date();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({
    direction: "they_owe",
    statement: "",
    dueAt: "",
  });

  function run(op: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(() => {
      void op().then((r) => {
        if (!r.ok)
          setError(FIELD_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
      });
    });
  }

  const open = items.filter((c) => c.status === "open");
  const settled = items.filter((c) => c.status !== "open");

  return (
    <Section
      title={FIELD_TEXT.commitTitle}
      description={FIELD_TEXT.commitDescription}
    >
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      {items.length === 0 ? (
        <EmptyState
          title={FIELD_TEXT.commitEmpty}
          description={FIELD_TEXT.commitEmptyDescription}
        />
      ) : null}

      {open.map((c) => {
        const overdue = isOverdue({ status: "open", dueAt: c.dueAt }, at);
        const days = Math.floor(
          Math.abs(at.getTime() - c.dueAt.getTime()) / DAY,
        );
        const chosen = picked[c.id] ?? "";
        return (
          <div key={c.id}>
            <StatusBadge tone={c.direction === "they_owe" ? "info" : "neutral"}>
              {DIRECTION_LABEL[c.direction] ?? c.direction}
            </StatusBadge>
            <span>{c.statement}</span>
            <StatusBadge tone={overdue ? "danger" : "neutral"} dot={overdue}>
              {overdue
                ? FIELD_TEXT.commitDaysOverdue(days)
                : FIELD_TEXT.commitDueIn(days)}
            </StatusBadge>

            {canWrite ? (
              <>
                {/* Closing needs proof. The picker IS the requirement. */}
                <NativeSelect
                  aria-label={FIELD_TEXT.commitCloseNeedsEvidence}
                  value={chosen}
                  onChange={(e) =>
                    setPicked({ ...picked, [c.id]: e.target.value })
                  }
                  disabled={pending || evidence.length === 0}
                >
                  <option value="">
                    {FIELD_TEXT.commitCloseNeedsEvidence}
                  </option>
                  {evidence.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  size="sm"
                  disabled={pending || chosen === ""}
                  onClick={() =>
                    run(() =>
                      onSettle(accountId, c.id, {
                        to: "met",
                        evidenceInteractionId: chosen,
                        opportunityId,
                      }),
                    )
                  }
                >
                  {FIELD_TEXT.commitClose}
                </Button>

                {/* Needs nothing, and is only offered once it is actually late. */}
                {overdue ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        onSettle(accountId, c.id, {
                          to: "missed",
                          opportunityId,
                        }),
                      )
                    }
                  >
                    {FIELD_TEXT.commitMissed}
                  </Button>
                ) : null}

                <Input
                  aria-label={FIELD_TEXT.commitWaiveReason}
                  placeholder={FIELD_TEXT.commitWaiveReason}
                  value={reason[c.id] ?? ""}
                  onChange={(e) =>
                    setReason({ ...reason, [c.id]: e.target.value })
                  }
                  disabled={pending}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending || !(reason[c.id] ?? "").trim()}
                  onClick={() =>
                    run(() =>
                      onSettle(accountId, c.id, {
                        to: "waived",
                        waiveReason: reason[c.id],
                        opportunityId,
                      }),
                    )
                  }
                >
                  {FIELD_TEXT.commitWaive}
                </Button>
              </>
            ) : null}
          </div>
        );
      })}

      {settled.map((c) => (
        <div key={c.id}>
          <StatusBadge
            tone={
              c.status === "met"
                ? "success"
                : c.status === "missed"
                  ? "danger"
                  : "neutral"
            }
          >
            {COMMIT_STATUS_LABEL[c.status] ?? c.status}
          </StatusBadge>
          <span>{c.statement}</span>
        </div>
      ))}

      {canWrite ? (
        <>
          <Label htmlFor="cm-statement">{FIELD_TEXT.commitStatement}</Label>
          <Textarea
            id="cm-statement"
            rows={2}
            value={draft.statement}
            onChange={(e) => setDraft({ ...draft, statement: e.target.value })}
            placeholder={FIELD_TEXT.commitStatementPlaceholder}
            disabled={pending}
          />
          <Label htmlFor="cm-direction">{FIELD_TEXT.commitDirection}</Label>
          <NativeSelect
            id="cm-direction"
            value={draft.direction}
            onChange={(e) => setDraft({ ...draft, direction: e.target.value })}
            disabled={pending}
          >
            {COMMITMENT_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {DIRECTION_LABEL[d] ?? d}
              </option>
            ))}
          </NativeSelect>
          <Label htmlFor="cm-due">{FIELD_TEXT.commitDue}</Label>
          <Input
            id="cm-due"
            type="date"
            value={draft.dueAt}
            onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
            disabled={pending}
          />
          <Button
            size="sm"
            disabled={pending || !draft.statement.trim() || !draft.dueAt}
            onClick={() =>
              run(() =>
                onCreate(accountId, { ...draft, opportunityId }).then((r) => {
                  if (r.ok)
                    setDraft({
                      direction: "they_owe",
                      statement: "",
                      dueAt: "",
                    });
                  return r;
                }),
              )
            }
          >
            {FIELD_TEXT.commitCreate}
          </Button>
        </>
      ) : null}
    </Section>
  );
}
