"use client";

import type { ReactNode } from "react";
import { Button, Card, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// The shape every DEDICATED FORM PAGE shares - owner ruling, 2026-09-05.
//
// The ruling that created this file: content-rich operations (creating,
// editing) get a PAGE of their own, because a page can afford a long layout and
// an assistant beside it; flow operations (delete, change status) get a dialog.
// Before it, eight list pages carried their create forms inline, and the form
// was always the cramped afterthought under the table.
//
// TWO COLUMNS: the work on the left, the help on the right. The aside is not
// decoration - it is where the product's intelligence surfaces while somebody
// is mid-form, which is exactly when a suggestion is worth something. On a
// narrow viewport the aside drops BELOW the form: the form is the errand.
export function FormPage({
  form,
  assist,
}: {
  readonly form: ReactNode;
  readonly assist?: ReactNode;
}) {
  return (
    <div className="grid items-start gap-lg xl:grid-cols-[1fr_20rem]">
      <div className="min-w-0">{form}</div>
      {assist ? <div className="min-w-0">{assist}</div> : null}
    </div>
  );
}

/** One thing the assistant noticed, and the one-click way to take it. */
export interface AssistSuggestion {
  readonly id: string;
  /** What is being suggested - short, concrete, already formatted. */
  readonly label: string;
  /** WHY the assistant thinks so. A suggestion with no reason is an order. */
  readonly reason: string;
  /** Applies the suggestion to the form. Absent = informational only. */
  readonly apply?: () => void;
}

/**
 * The assistant beside a form.
 *
 * DATA-DERIVED FIRST. Everything rendered here today is computed from what the
 * workspace already knows - existing codes, existing ratios, existing
 * vocabulary - because that needs no model round-trip and is right or wrong in
 * a way the person can check at a glance. The same panel is where model-backed
 * suggestions land when the Atlas channel carries them; the contract (label,
 * reason, one-click apply) does not change, only the source does.
 *
 * EVERY SUGGESTION CARRIES ITS REASON. The panel proposes and the person
 * decides - the same boundary ADR-003 draws for the copilot, at form scale. A
 * suggestion is applied by a click, never applied by default: a form that
 * fills itself in has decided, and deciding is not its job.
 */
export function AssistPanel({
  title,
  description,
  suggestions,
  children,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly suggestions: readonly AssistSuggestion[];
  /** Extra panel content below the suggestions - context, previews. */
  readonly children?: ReactNode;
}) {
  const { ASSIST_TEXT } = useMessages();
  return (
    <Section
      icon="sparkles"
      title={title ?? ASSIST_TEXT.title}
      description={description ?? ASSIST_TEXT.description}
    >
      {suggestions.length === 0 && !children ? (
        <p className="text-muted-foreground text-body-sm">{ASSIST_TEXT.nothing}</p>
      ) : (
        <div className="flex flex-col gap-sm">
          {suggestions.map((s) => (
            <Card key={s.id} className="p-md">
              <div className="flex flex-col gap-xs">
                <span className="text-foreground text-body-sm font-medium">{s.label}</span>
                <span className="text-muted-foreground text-body-sm">{s.reason}</span>
                {s.apply ? (
                  <div>
                    <Button size="sm" variant="secondary" onClick={s.apply}>
                      {ASSIST_TEXT.apply}
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
          {children}
        </div>
      )}
    </Section>
  );
}
