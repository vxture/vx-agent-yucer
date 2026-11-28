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
import type {
  CooperationAssertion,
  CooperationInput,
} from "../../domains/account/lib/cooperation";
import { useLocale } from "../lib/i18n/provider";
import { attainmentCopy } from "./copy";
import { saveCooperationHistory } from "./actions";

/** Reusable original customer-history form; no analysis-specific database writes. */
export function CooperationEditor({
  account,
  history,
  year,
}: {
  account: { id: string; name: string };
  history: CooperationAssertion | null;
  year: number;
}) {
  const T = attainmentCopy(useLocale());
  const [open, setOpen] = useState(false),
    [pending, start] = useTransition(),
    [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<CooperationInput["state"]>(
    history?.state ?? "unknown",
  );
  const [date, setDate] = useState(history?.firstDate ?? ""),
    [before, setBefore] = useState(String(history?.beforeYear ?? year));
  const [evidence, setEvidence] = useState(history?.evidence ?? ""),
    [requestKey, setRequestKey] = useState("");
  const begin = () => {
    setRequestKey(crypto.randomUUID());
    setError(null);
    setOpen(true);
  };
  return (
    <>
      <Button size="sm" variant="ghost" onClick={begin}>
        {T.confirmHistory}
      </Button>
      <Drawer
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        className="max-w-[100vw]"
        width="md"
        title={`${account.name} \u00b7 ${T.customerHistory}`}
        description={T.historyHelp}
      >
        <form
          className="flex flex-col gap-lg"
          onSubmit={(event) => {
            event.preventDefault();
            start(async () => {
              const result = await saveCooperationHistory(account.id, {
                state,
                firstDate: state === "dated" ? date : null,
                beforeYear: state === "before_year" ? Number(before) : null,
                acquisitionOwnerSub: null,
                acquisitionTerritoryId: null,
                evidence,
                requestKey,
              });
              setError(result.ok ? null : result.error);
              if (result.ok) {
                setOpen(false);
                window.dispatchEvent(new Event("yucer:business-updated"));
              }
            });
          }}
        >
          <Field>
            <FieldLabel>{T.status}</FieldLabel>
            <NativeSelect
              value={state}
              onChange={(event) =>
                setState(event.target.value as CooperationInput["state"])
              }
              disabled={pending}
            >
              <option value="unknown">{T.unknownHistory}</option>
              <option value="never">{T.never}</option>
              <option value="dated">{T.dated}</option>
              <option value="before_year">{T.before_year}</option>
            </NativeSelect>
          </Field>
          {state === "dated" ? (
            <Field>
              <FieldLabel htmlFor={`cooperation-date-${account.id}`}>
                {T.firstDate}
              </FieldLabel>
              <Input
                id={`cooperation-date-${account.id}`}
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={pending}
              />
            </Field>
          ) : null}
          {state === "before_year" ? (
            <Field>
              <FieldLabel htmlFor={`cooperation-year-${account.id}`}>
                {T.beforeYear}
              </FieldLabel>
              <Input
                id={`cooperation-year-${account.id}`}
                type="number"
                min={1901}
                max={new Date().getFullYear()}
                required
                value={before}
                onChange={(event) => setBefore(event.target.value)}
                disabled={pending}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor={`cooperation-evidence-${account.id}`}>
              {T.evidence}
            </FieldLabel>
            <Textarea
              id={`cooperation-evidence-${account.id}`}
              required
              maxLength={500}
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              placeholder={T.historyEvidence}
              disabled={pending}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-body-small text-destructive-text">
              {error === "cooperation_conflict" ? T.historyConflict : T.retry}
            </p>
          ) : null}
          <div className="flex justify-end gap-sm">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {T.cancel}
            </Button>
            <Button type="submit" size="md" disabled={pending}>
              {T.save}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
