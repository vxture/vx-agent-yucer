"use client";

import { useState, useTransition } from "react";
import { Field, FieldLabel, Input, Textarea } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useDealEditor } from "./deal-edit-context";
import { DialogForm } from "./dialog-form";

/** Copy correction uses the same gated business service as the terms editor. */
export function DealDetails({ opportunityId, name, requirement, canEdit, onSave }: {
  readonly opportunityId: string;
  readonly name: string;
  readonly requirement: string;
  readonly canEdit: boolean;
  readonly onSave: (id: string, input: { name?: string; requirement?: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { DEAL_PAGE_TEXT: T, PIPELINE_TEXT: O, OPPORTUNITY_ERROR: E } = useMessages();
  const { open, onOpenChange } = useDealEditor("details");
  const [form, setForm] = useState({ name, requirement });
  const [error, setError] = useState("");
  const [pending, transition] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) { setForm({ name, requirement }); setError(""); }
  }
  if (!canEdit) return null;
  const unchanged = form.name === name && form.requirement === requirement;
  return <DialogForm open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}
    title={T.editDetails} description={T.editDetailsHint} submitting={pending}
    submitDisabled={unchanged || !form.name.trim() || !form.requirement.trim()}
    onSubmit={event => {
      event.preventDefault();
      setError("");
      transition(async () => {
        try {
          const result = await onSave(opportunityId, {
            name: form.name !== name ? form.name : undefined,
            requirement: form.requirement !== requirement ? form.requirement : undefined,
          });
          if (result.ok) onOpenChange(false);
          else setError(E[result.error ?? "denied"] ?? E.denied ?? "denied");
        } catch { setError(E.denied ?? "denied"); }
      });
    }}>
    <Field><FieldLabel required>{O.newName}</FieldLabel><Input disabled={pending} maxLength={255} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></Field>
    <Field><FieldLabel required>{O.newRequirement}</FieldLabel><Textarea disabled={pending} rows={3} value={form.requirement} onChange={event => setForm({ ...form, requirement: event.target.value })}/></Field>
    {error ? <p role="alert" className="text-body-small text-destructive">{error}</p> : null}
  </DialogForm>;
}
