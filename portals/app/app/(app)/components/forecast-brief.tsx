"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Card, Icon, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { explainModelPlaneError, isModelPlaneError } from "../lib/model-plane-error";
import type { ForecastBriefResult } from "../forecast/brief-action";

// 预测会简报 on 预测检视台 (deal batch 9e): one press, the admitted narrative
// over the board's own figures, and what to ask each owner - grouped by owner,
// each question linking to its deal when it names one.

export function ForecastBriefPanel({
  period,
  scopeKey,
  onBrief,
}: {
  readonly period: string;
  readonly scopeKey: string;
  readonly onBrief: (period: string, scopeKey: string) => Promise<ForecastBriefResult>;
}) {
  const { FORECAST_BRIEF_TEXT: T, FORECAST_BRIEF_ERROR, COPILOT_TEXT } = useMessages();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Extract<ForecastBriefResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byOwner = new Map<string, NonNullable<typeof result>["questions"][number][]>();
  for (const q of result?.questions ?? []) byOwner.set(q.owner, [...(byOwner.get(q.owner) ?? []), q]);

  return (
    <Section
      icon="sparkles"
      title={T.title}
      description={T.why}
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await onBrief(period, scopeKey);
              if (r.ok) {
                setResult(r);
                setError(null);
              } else {
                setError(
                  isModelPlaneError(r.error)
                    ? explainModelPlaneError(r.error, COPILOT_TEXT)
                    : (FORECAST_BRIEF_ERROR[r.error] ?? FORECAST_BRIEF_ERROR.unknown ?? r.error),
                );
              }
            })
          }
        >
          <Icon name="sparkles" size="xs" />
          {pending ? T.running : T.run}
        </Button>
      }
    >
      {error ? <StatusBadge tone="warning">{error}</StatusBadge> : null}
      {result ? (
        <Card className="flex flex-col gap-sm p-md text-body-small">
          {result.summary.length > 0 ? (
            <div className="flex flex-col gap-2xs">
              {result.summary.map((s) => (
                <p key={s} className="text-foreground">
                  {s}
                </p>
              ))}
            </div>
          ) : null}
          {byOwner.size > 0 ? (
            <div>
              <p className="text-muted-foreground">{T.questions}</p>
              <ul className="mt-2xs flex flex-col gap-xs">
                {[...byOwner].map(([owner, qs]) => (
                  <li key={owner}>
                    <span className="text-foreground font-medium">{owner}</span>
                    <ul className="ml-md list-disc">
                      {qs.map((q) => (
                        <li key={q.text}>
                          {q.text}
                          {q.dealId ? (
                            <>
                              {" "}
                              <Link href={`/pipeline/${q.dealId}`} className="text-primary hover:underline">
                                {q.dealName ?? q.dealId}
                              </Link>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.dropped > 0 ? <p className="text-muted-foreground">{T.dropped(result.dropped)}</p> : null}
          {result.cached ? <p className="text-muted-foreground">{T.cached}</p> : null}
        </Card>
      ) : null}
    </Section>
  );
}
