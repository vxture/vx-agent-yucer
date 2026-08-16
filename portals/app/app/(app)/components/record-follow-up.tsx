"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, NativeSelect, PageSection, StatusBadge, Textarea } from "@vxture/design-system";
import { INTERACTION_CHANNELS } from "../../domains/account/lib/commitment";
import { CHANNEL_LABEL, FIELD_ERROR, FIELD_TEXT } from "../lib/messages";

// Capture.
//
// This form is the whole bet. Stage 1 has a kill criterion measured in
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
    input: { channel: string; occurredAt: string; rawNote: string; opportunityId?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

/** Local datetime for the input's value - a UTC ISO string would show the
 * wrong hour to anyone not on UTC, and the default must read as "now". */
function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RecordFollowUp({ accountId, opportunityId, canRecord, onRecord }: RecordFollowUpProps) {
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState<string>("meeting");
  const [occurredAt, setOccurredAt] = useState(localNow());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!canRecord) return null;

  function submit() {
    setError(null);
    setSaved(false);
    startTransition(() => {
      void onRecord(accountId, { channel, occurredAt, rawNote: note, opportunityId }).then((r) => {
        if (!r.ok) setError(FIELD_ERROR[r.error ?? "denied"] ?? r.error ?? "denied");
        else {
          setSaved(true);
          setNote("");
          setOccurredAt(localNow());
        }
      });
    });
  }

  return (
    <PageSection title={FIELD_TEXT.recordTitle} description={FIELD_TEXT.recordDescription}>
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

      <Button onClick={submit} disabled={pending || note.trim() === ""}>
        {FIELD_TEXT.recordSubmit}
      </Button>

      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      {saved ? <StatusBadge tone="success">{FIELD_TEXT.recordSaved}</StatusBadge> : null}
    </PageSection>
  );
}
