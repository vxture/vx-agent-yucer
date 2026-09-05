"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Label,
  NativeSelect,
  Section,
  StatusBadge,
  Textarea,
} from "@vxture/design-ui";
import { INTERACTION_CHANNELS } from "../../domains/account/lib/commitment";
import { useMessages } from "../lib/i18n/provider";

// Capture.
//
// This form is the whole bet. ADR-012 sets a kill criterion measured in
// confirmed interactions per opportunity per week, and a form that feels like
// admin will produce zero of them - that is how CRMs die, and it is not a
// motivation problem. Entry costs the rep and the benefit lands on the manager.
//
// So it asks for a DUMP, not a report:
//
//   - ONE required field, the note. Three sentences in a taxi, a pasted chat
//     thread, a forwarded mail - all of it counts, and the text is stored
//     verbatim and never rewritten by a later interpretation.
//   - The date defaults to now, because the overwhelmingly common case is
//     "just happened" and asking costs a decision.
//   - Channel is a picker with a default, not a required choice.
//
// There is deliberately no "outcome", no "next step" and no "sentiment" field.
// Every one of those is a judgement, and asking a rep to make judgements at
// capture time is how you get either blank fields or invented ones.

export interface RecordFollowUpProps {
  readonly accountId: string;
  readonly opportunityId?: string;
  readonly canRecord: boolean;
  readonly onRecord: (
    accountId: string,
    input: {
      channel: string;
      occurredAt: string;
      rawNote: string;
      opportunityId?: string;
      commitments?: readonly { direction: string; statement: string; dueAt: string }[];
    },
  ) => Promise<{ ok: boolean; error?: string; failedCommitments?: number }>;
}

/** Local datetime for the input's value - a UTC ISO string would show the
 * wrong hour to anyone not on UTC, and the default must read as "now". */
function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RecordFollowUp({
  accountId,
  opportunityId,
  canRecord,
  onRecord,
  doneHref,
}: RecordFollowUpProps & { readonly doneHref?: string }) {
  const router = useRouter();
  const { CHANNEL_LABEL, FIELD_ERROR, FIELD_TEXT } = useMessages();
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState<string>("meeting");
  const [occurredAt, setOccurredAt] = useState(localNow());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // The promises made in THIS conversation - the consolidation of 2026-09-05.
  // The commitment form used to live twice, on two pages, severed from the
  // interaction it came out of; origin_interaction_id (in the schema since
  // incr/0004 for exactly this) was never once set by the interface. Optional
  // rows here keep the dump zero-friction - the note alone still submits -
  // while "who promised what" is one gesture away instead of a second form.
  const [promises, setPromises] = useState<
    readonly { direction: string; statement: string; dueAt: string }[]
  >([]);

  if (!canRecord) return null;

  function submit() {
    setError(null);
    setSaved(false);
    startTransition(() => {
      void onRecord(accountId, {
        channel,
        occurredAt,
        rawNote: note,
        opportunityId,
        commitments: promises.filter((p) => p.statement.trim() !== ""),
      }).then((r) => {
        if (!r.ok)
          setError(FIELD_ERROR[r.error ?? "denied"] ?? FIELD_ERROR.denied);
        else if (r.failedCommitments) {
          // Partial success is a real outcome: the note landed (it is
          // evidence, append-only) and some promise row was refused. STAY on
          // the page and say so - navigating away would swallow it.
          setError(FIELD_ERROR.commitment_partial ?? null);
          setSaved(true);
          setNote("");
          setPromises([]);
        } else if (doneHref) {
          // A capture page is an errand: back to where the person came from.
          router.push(doneHref);
          router.refresh();
        } else {
          setSaved(true);
          setNote("");
          setPromises([]);
          setOccurredAt(localNow());
        }
      });
    });
  }

  return (
    <Section
      title={FIELD_TEXT.recordTitle}
      description={FIELD_TEXT.recordDescription}
    >
      <Label htmlFor="fu-note">{FIELD_TEXT.recordNote}</Label>
      <Textarea
        id="fu-note"
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={FIELD_TEXT.recordNotePlaceholder}
        disabled={pending}
      />

      <Label htmlFor="fu-channel">{FIELD_TEXT.recordChannel}</Label>
      <NativeSelect
        id="fu-channel"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        disabled={pending}
      >
        {INTERACTION_CHANNELS.map((c) => (
          <option key={c} value={c}>
            {CHANNEL_LABEL[c] ?? c}
          </option>
        ))}
      </NativeSelect>

      <Label htmlFor="fu-when">{FIELD_TEXT.recordWhen}</Label>
      <Input
        id="fu-when"
        type="datetime-local"
        value={occurredAt}
        onChange={(e) => setOccurredAt(e.target.value)}
        disabled={pending}
      />

      {promises.map((p, i) => (
        /* Index keys are safe: rows are appended/removed on a local draft,
           never reordered. */
        <div key={i} className="flex flex-wrap items-end gap-sm">
          <div className="min-w-[14rem] flex-1">
            <Label htmlFor={`cm-st-${i}`}>{FIELD_TEXT.commitStatement}</Label>
            <Input
              id={`cm-st-${i}`}
              value={p.statement}
              onChange={(e) =>
                setPromises(promises.map((x, j) => (j === i ? { ...x, statement: e.target.value } : x)))
              }
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor={`cm-dir-${i}`}>{FIELD_TEXT.commitDirection}</Label>
            <NativeSelect
              id={`cm-dir-${i}`}
              value={p.direction}
              onChange={(e) =>
                setPromises(promises.map((x, j) => (j === i ? { ...x, direction: e.target.value } : x)))
              }
              disabled={pending}
            >
              <option value="we_owe">{FIELD_TEXT.directionOurs}</option>
              <option value="they_owe">{FIELD_TEXT.directionTheirs}</option>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor={`cm-due-${i}`}>{FIELD_TEXT.commitDue}</Label>
            <Input
              id={`cm-due-${i}`}
              type="date"
              value={p.dueAt}
              onChange={(e) =>
                setPromises(promises.map((x, j) => (j === i ? { ...x, dueAt: e.target.value } : x)))
              }
              disabled={pending}
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => setPromises(promises.filter((_, j) => j !== i))}
            disabled={pending}
          >
            {FIELD_TEXT.commitRemove}
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-sm">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            setPromises([...promises, { direction: "they_owe", statement: "", dueAt: "" }])
          }
        >
          {FIELD_TEXT.commitAdd}
        </Button>
        <Button
          onClick={submit}
          disabled={
            pending ||
            note.trim() === "" ||
            promises.some((p) => p.statement.trim() !== "" && p.dueAt === "")
          }
        >
          {FIELD_TEXT.recordSubmit}
        </Button>
      </div>

      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {saved ? (
        <StatusBadge tone="success">{FIELD_TEXT.recordSaved}</StatusBadge>
      ) : null}
    </Section>
  );
}
