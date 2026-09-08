"use client";

import { useState, useTransition } from "react";
import { Button, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { importTemplate } from "../territory/actions";

/* 引用预置 - adopt a shipped carve wholesale.
 *
 * TWO ARE SHIPPED and neither is more correct: the five-way 东南西北中, and the
 * seven-way 华北/东北/华东/华中/华南/西南/西北 that this repo's territory routing
 * already speaks. A workspace starts on one and edits from there; nothing here
 * treats either as the shape of the world.
 *
 * IT REPLACES, and says so before doing it. Both carves place all 34 provinces,
 * so importing one is a statement about the whole market - and a workspace that
 * has already customised is told exactly how many of its own divisions the
 * import would discard.
 */
export interface TemplateOption {
  readonly key: string;
  readonly label: string;
  readonly divisions: number;
  /** The division names, so the choice can be read before it is taken. */
  readonly names: readonly string[];
}

export function DivisionImport(
  { templates, currentDivisions, customCount }:
  {
    readonly templates: readonly TemplateOption[];
    readonly currentDivisions: number;
    /** How many of the current divisions are the tenant's own work. */
    readonly customCount: number;
  },
) {
  const { PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const run = (key: string) => {
    setError(null);
    start(async () => {
      const r = await importTemplate(key);
      if (!r.ok) setError(TERRITORY_ERROR[r.error] ?? r.error);
      setConfirming(null);
    });
  };

  return (
    <Section title={PLANNING_TEXT.templateTitle} description={PLANNING_TEXT.templateWhy}>
      {error ? <p className="text-destructive text-body-sm" role="alert">{error}</p> : null}
      <div className="gap-md flex flex-col">
        {templates.map((t) => (
          <div className="border-border gap-2xs flex flex-col rounded-md border p-md" key={t.key}>
            <p className="text-body font-semibold">{t.label}</p>
            <p className="text-muted-foreground text-body-sm">{t.names.join(" / ")}</p>
            {confirming === t.key ? (
              <div className="gap-sm mt-xs flex items-center">
                {/* The cost, stated in the tenant's own numbers rather than as
                    a generic "are you sure". */}
                <span className="text-warning text-body-sm">
                  {PLANNING_TEXT.templateReplaceWarn(currentDivisions, customCount)}
                </span>
                <Button disabled={pending} onClick={() => run(t.key)}>
                  {PLANNING_TEXT.templateConfirm}
                </Button>
                <Button variant="secondary" disabled={pending} onClick={() => setConfirming(null)}>
                  {PLANNING_TEXT.templateCancel}
                </Button>
              </div>
            ) : (
              <div className="mt-xs">
                <Button variant="secondary" disabled={pending} onClick={() => setConfirming(t.key)}>
                  {PLANNING_TEXT.templateAdopt}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
