"use client";
import { useState, useTransition } from "react";
import {
  Button,
  Drawer,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Textarea,
} from "@vxture/design-system";
import type { PlanActionResult } from "../../domains/planning/action-result";
import { useLocale } from "../lib/i18n/provider";
import { attainmentCopy } from "./copy";
import { saveCustomerActionResult } from "./actions";

export function ActionResultEditor({
  year,
  period,
  revisionId,
  accountId,
  action,
  result,
}: {
  year: number;
  period: string;
  revisionId: string;
  accountId: string;
  action: { key: string; objective: string };
  result: PlanActionResult | null;
}) {
  const T = attainmentCopy(useLocale()),
    [open, setOpen] = useState(false),
    [pending, start] = useTransition();
  const [met, setMet] = useState(result?.met ? "met" : "unmet"),
    [evidence, setEvidence] = useState(result?.evidence ?? ""),
    [date, setDate] = useState(
      result?.occurredAt ?? new Date().toISOString().slice(0, 10),
    ),
    [requestKey, setRequestKey] = useState(""),
    [error, setError] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setRequestKey(crypto.randomUUID());
          setError(false);
          setOpen(true);
        }}
      >
        {T.checkEvidence}
      </Button>
      <Drawer
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={action.objective}
        className="max-w-[100vw]"
        width="md"
      >
        <form
          className="flex flex-col gap-lg"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              const saved = await saveCustomerActionResult({
                year,
                period,
                revisionId,
                accountId,
                actionKey: action.key,
                met: met === "met",
                occurredAt: date,
                evidence,
                requestKey,
              });
              setError(!saved.ok);
              if (saved.ok) {
                setOpen(false);
                window.dispatchEvent(new Event("yucer:business-updated"));
              }
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`action-result-${action.key}`}>
              {T.result}
            </FieldLabel>
            <NativeSelect
              id={`action-result-${action.key}`}
              value={met}
              disabled={pending}
              onChange={(event) => setMet(event.target.value)}
            >
              <option value="unmet">{T.unachieved}</option>
              <option value="met">{T.achieved}</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`action-date-${action.key}`}>
              {T.verifiedDate}
            </FieldLabel>
            <Input
              id={`action-date-${action.key}`}
              type="date"
              required
              value={date}
              disabled={pending}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`action-evidence-${action.key}`}>
              {T.evidence}
            </FieldLabel>
            <Textarea
              id={`action-evidence-${action.key}`}
              required
              maxLength={500}
              value={evidence}
              disabled={pending}
              onChange={(event) => setEvidence(event.target.value)}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-body-small text-destructive-text">
              {T.retry}
            </p>
          ) : null}
          <div className="flex justify-end gap-sm">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {T.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {T.save}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
