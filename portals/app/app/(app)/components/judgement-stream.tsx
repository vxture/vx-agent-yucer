"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  EmptyState,
  FactList,
  SegmentedControl,
  StatusBadge,
} from "@vxture/design-ui";
import { HOME_TEXT } from "../lib/messages";
import type { Judgement, Urgency } from "../../domains/judgement/lib/judgement";

// The home screen's stream.
//
// One judgement open at a time. That is not a space saving - it is what lets
// the open one be worth reading. A list where everything is expanded is a wall,
// and a list where nothing expands is a list of headlines nobody can check.
//
// THE SOURCE MARKER IS THE LOAD-BEARING PART. A rule judgement and a model
// judgement are both single true-shaped sentences, and they deserve completely
// different scepticism:
//
//   rule  - shows its trigger condition. You can recompute it and disagree
//           with the arithmetic.
//   model - shows which notes it cited. You cannot recompute it; the only
//           check available is whether those notes say what it claims.
//
// Rendering them identically would teach people to trust both or neither.

export interface JudgementStreamProps {
  readonly judgements: readonly Judgement[];
  readonly counts: Record<Urgency, number>;
  readonly scanned: number;
  readonly scope: "mine" | "all";
  readonly hasAnyRecord: boolean;
}

type Tier = Urgency | "all";

export function JudgementStream({
  judgements,
  counts,
  scanned,
  scope,
  hasAnyRecord,
}: JudgementStreamProps) {
  const [tier, setTier] = useState<Tier>("all");
  const [open, setOpen] = useState<string>(judgements[0]?.id ?? "");

  const shown = tier === "all" ? judgements : judgements.filter((j) => j.urgency === tier);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{HOME_TEXT.title}</h1>
          <p className="text-muted-foreground text-sm">{HOME_TEXT.description(scanned)}</p>
        </div>

        {/* Both filters right-aligned, together. The counts live inside the
            tiers rather than in a separate strip of metric cards: they are
            filter labels, not a dashboard, and a strip of three big numbers
            costs a screen of height to say three numbers. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel={HOME_TEXT.scopeLabel}
            value={scope}
            onChange={(v) => {
              window.location.search = v === "all" ? "?scope=all" : "";
            }}
            items={[
              { value: "mine", label: HOME_TEXT.scopeMine },
              { value: "all", label: HOME_TEXT.scopeAll },
            ]}
          />
          <SegmentedControl
            ariaLabel={HOME_TEXT.urgencyLabel}
            value={tier}
            onChange={(v: Tier) => setTier(v)}
            items={[
              { value: "all", label: HOME_TEXT.urgencyAll, count: judgements.length },
              { value: "today", label: HOME_TEXT.urgencyToday, count: counts.today },
              { value: "week", label: HOME_TEXT.urgencyWeek, count: counts.week },
              { value: "watch", label: HOME_TEXT.urgencyWatch, count: counts.watch },
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={HOME_TEXT.emptyTitle}
          description={hasAnyRecord ? HOME_TEXT.emptyDescription : HOME_TEXT.emptyNoRecords}
        />
      ) : (
        <Accordion
          type="single"
          collapsible
          value={open}
          onValueChange={setOpen}
          className="flex flex-col gap-2"
        >
          {shown.map((j) => (
            <JudgementCard key={j.id} judgement={j} />
          ))}
        </Accordion>
      )}
    </>
  );
}

const TIER_TONE: Record<Urgency, "danger" | "warning" | "info"> = {
  today: "danger",
  week: "warning",
  watch: "info",
};

function JudgementCard({ judgement: j }: { judgement: Judgement }) {
  const href =
    j.subjectType === "account"
      ? `/account/${j.subjectId}`
      : j.subjectType === "opportunity"
        ? `/pipeline/${j.subjectId}`
        : "/admin/adoption";

  return (
    <AccordionItem value={j.id} className="bg-card rounded-md border">
      <AccordionTrigger className="px-3 py-2 text-left hover:no-underline">
        <span className="flex min-w-0 flex-1 items-start gap-2">
          {/* The tier as a colour bar rather than another chip: it is the one
              attribute every card has, so it should read without being read. */}
          <span
            aria-hidden
            className="mt-0.5 w-[3px] self-stretch rounded-full"
            style={{ background: `var(--${TIER_TONE[j.urgency]})` }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-snug">{j.claim}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <SourceMark source={j.source} />
              {j.tags.map((t, i) => (
                <StatusBadge key={i} tone={t.tone ?? "neutral"}>
                  {t.label ? `${t.label} ${t.value}` : t.value}
                </StatusBadge>
              ))}
            </span>
          </span>
        </span>
      </AccordionTrigger>

      <AccordionContent className="border-t px-3 pb-0 pt-3">
        {j.citations.length > 0 ? (
          <section className="mb-3">
            <h4 className="text-muted-foreground mb-1.5 text-xs font-bold tracking-wide uppercase">
              {HOME_TEXT.secEvidenceCount(j.citations.length)}
            </h4>
            <div className="flex flex-col gap-2">
              {j.citations.map((c, i) => (
                <blockquote key={i} className="border-l-2 pl-2.5 text-sm leading-relaxed">
                  {c.who ? (
                    <cite className="text-muted-foreground block text-xs not-italic tabular-nums">
                      {c.who}
                    </cite>
                  ) : null}
                  {/* Verbatim. Everything downstream cites these rows, so what a
                      reader can open must be what was cited. */}
                  <span className="text-muted-foreground">{c.text}</span>
                </blockquote>
              ))}
            </div>
          </section>
        ) : null}

        {j.facts.length > 0 ? (
          <section className="mb-3">
            <h4 className="text-muted-foreground mb-1.5 text-xs font-bold tracking-wide uppercase">
              {HOME_TEXT.secFacts}
            </h4>
            <FactList
              facts={j.facts.map((f) => ({ label: f.label, value: f.value, tone: f.tone }))}
            />
          </section>
        ) : null}

        {j.rule ? (
          <section className="mb-3">
            <h4 className="text-muted-foreground mb-1.5 text-xs font-bold tracking-wide uppercase">
              {HOME_TEXT.secRule}
            </h4>
            {/* Shown so the reader can disagree with the arithmetic rather than
                with the conclusion. A rule that hides its condition is an
                opinion wearing a formula's clothes. */}
            <code className="bg-muted text-muted-foreground block rounded px-2 py-1.5 text-xs">
              {j.rule}
            </code>
          </section>
        ) : null}

        <footer className="bg-muted -mx-3 flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
          <Button size="sm" asChild>
            <Link href={href}>{HOME_TEXT.openSubject}</Link>
          </Button>
          {/* The analyses are deliberately quieter than the decision: one costs
              a model call and looks again, the other files a proposal a human
              must sign. They must not weigh the same. */}
          {j.analyses.includes("risk") ? (
            <Button size="sm" variant="ghost">{HOME_TEXT.analysisRisk}</Button>
          ) : null}
          {j.analyses.includes("competition") ? (
            <Button size="sm" variant="ghost">{HOME_TEXT.analysisCompetition}</Button>
          ) : null}
          {j.analyses.includes("policy") ? (
            <Button size="sm" variant="ghost">{HOME_TEXT.analysisPolicy}</Button>
          ) : null}
          <Button size="sm" variant="ghost" className="text-muted-foreground">
            {HOME_TEXT.actDismiss}
          </Button>
          {j.analyses.length > 0 ? (
            <span className="text-muted-foreground ml-auto text-xs">{HOME_TEXT.analysisHint}</span>
          ) : null}
        </footer>
      </AccordionContent>
    </AccordionItem>
  );
}

/** Rule vs model, and what each one means for how to read the claim. */
function SourceMark({ source }: { source: Judgement["source"] }) {
  const rule = source === "rule";
  return (
    <Badge
      variant={rule ? "outline" : "default"}
      title={rule ? HOME_TEXT.sourceRuleHint : HOME_TEXT.sourceModelHint}
    >
      <span aria-hidden className="font-mono">{rule ? "=" : "~"}</span>
      {rule ? HOME_TEXT.sourceRule : HOME_TEXT.sourceModel}
    </Badge>
  );
}
