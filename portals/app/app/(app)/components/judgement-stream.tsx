"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
  FactList,
  PanelCard,
  SectionHeader,
  SegmentedControl,
  Stack,
  StatusBadge,
} from "@vxture/design-ui";
import { HOME_TEXT } from "../lib/messages";
import type { Judgement, Urgency } from "../../domains/judgement/lib/judgement";

// The home screen's stream.
//
// One judgement open at a time, and that is not a space saving - it is what
// lets the open one be worth reading. A list where everything is expanded is a
// wall; a list where nothing expands is headlines nobody can check.
//
// THE SOURCE MARKER IS THE LOAD-BEARING PART. A rule judgement and a model
// judgement are both single true-shaped sentences and deserve completely
// different scepticism:
//
//   rule  - shows its trigger condition. You can recompute it and disagree
//           with the arithmetic.
//   model - shows which notes it cited. You cannot recompute it; the only
//           check available is whether those notes say what it claims.
//
// Rendering them identically would teach people to trust both or neither.
//
// The card is a PanelCard, so the tier colours its TOP edge - the DS already
// has a convention for exactly this. An earlier version drew its own left
// stripe out of Tailwind utilities, which is restyling the design system rather
// than using it.

export interface JudgementStreamProps {
  readonly judgements: readonly Judgement[];
  readonly counts: Record<Urgency, number>;
  readonly scanned: number;
  readonly scope: "mine" | "all";
  readonly hasAnyRecord: boolean;
}

type Tier = Urgency | "all";

const TIER_TONE: Record<Urgency, "danger" | "warning" | "info"> = {
  today: "danger",
  week: "warning",
  watch: "info",
};

export function JudgementStream({
  judgements,
  counts,
  scanned,
  scope,
  hasAnyRecord,
}: JudgementStreamProps) {
  const [tier, setTier] = useState<Tier>("all");
  // One id for the whole list, so opening a card closes the previous one
  // without any card needing to know the others exist.
  const [openId, setOpenId] = useState<string>(judgements[0]?.id ?? "");

  const shown = tier === "all" ? judgements : judgements.filter((j) => j.urgency === tier);

  return (
    <Stack gap="md">
      <SectionHeader
        level={1}
        title={HOME_TEXT.title}
        description={HOME_TEXT.description(scanned)}
        // Both filters together on the right. The counts ride inside the tiers
        // rather than in a strip of metric cards above: they are filter labels,
        // and three big numbers should not cost a screen of height to say three
        // numbers.
        action={
          <Stack gap="xs" className="flex-row flex-wrap items-center">
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
          </Stack>
        }
      />

      {shown.length === 0 ? (
        <EmptyState
          title={HOME_TEXT.emptyTitle}
          // Two different silences. "Nothing is wrong" and "nothing has been
          // recorded, so nothing can be concluded" look identical on a screen
          // and mean opposite things.
          description={hasAnyRecord ? HOME_TEXT.emptyDescription : HOME_TEXT.emptyNoRecords}
        />
      ) : (
        <Stack gap="sm">
          {shown.map((j) => (
            <JudgementCard
              key={j.id}
              judgement={j}
              open={openId === j.id}
              onOpenChange={(next) => setOpenId(next ? j.id : "")}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function JudgementCard({
  judgement: j,
  open,
  onOpenChange,
}: {
  judgement: Judgement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const href =
    j.subjectType === "account"
      ? `/account/${j.subjectId}`
      : j.subjectType === "opportunity"
        ? `/pipeline/${j.subjectId}`
        : "/admin/adoption";

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <PanelCard
        tone={TIER_TONE[j.urgency]}
        title={j.claim}
        titleSuffix={<SourceMark source={j.source} />}
        description={
          <Stack gap="xs" className="flex-row flex-wrap items-center">
            {j.tags.map((t, i) => (
              <StatusBadge key={i} tone={t.tone ?? "neutral"}>
                {t.label ? `${t.label} ${t.value}` : t.value}
              </StatusBadge>
            ))}
          </Stack>
        }
        action={
          <CollapsibleTrigger asChild>
            {/* The label says which way it goes, so no chevron is needed -
                and a word survives a screen reader better than a glyph. */}
            <Button variant="ghost" size="sm" aria-expanded={open}>
              {open ? HOME_TEXT.collapse : HOME_TEXT.expand}
            </Button>
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent>
          <Stack gap="md">
            {j.citations.length > 0 ? (
              <section>
                <SectionHeader level={4} title={HOME_TEXT.secEvidenceCount(j.citations.length)} />
                <Stack gap="sm">
                  {j.citations.map((c, i) => (
                    // Verbatim. Everything downstream cites these rows, so what
                    // a reader can open must be what was cited - a tidied
                    // summary here would make provenance a story.
                    <blockquote key={i} className="border-border border-l-2 pl-sm">
                      {c.who ? (
                        <cite className="text-muted-foreground block text-xs not-italic tabular-nums">
                          {c.who}
                        </cite>
                      ) : null}
                      <p className="text-muted-foreground text-sm leading-relaxed">{c.text}</p>
                    </blockquote>
                  ))}
                </Stack>
              </section>
            ) : null}

            {j.facts.length > 0 ? (
              <section>
                <SectionHeader level={4} title={HOME_TEXT.secFacts} />
                <FactList
                  facts={j.facts.map((f) => ({ label: f.label, value: f.value, tone: f.tone }))}
                />
              </section>
            ) : null}

            {j.rule ? (
              <section>
                <SectionHeader level={4} title={HOME_TEXT.secRule} />
                {/* Shown so a reader can disagree with the arithmetic rather
                    than with the conclusion. A rule that hides its condition is
                    an opinion wearing a formula's clothes. */}
                <code className="bg-muted text-muted-foreground block rounded-md px-sm py-xs text-xs">
                  {j.rule}
                </code>
              </section>
            ) : null}

            <Stack gap="xs" className="flex-row flex-wrap items-center">
              <Button size="sm" asChild>
                <Link href={href}>{HOME_TEXT.openSubject}</Link>
              </Button>
              {/* Analyses are deliberately quieter than the decision: one looks
                  again, the other files a proposal a person must sign. They
                  must not weigh the same. */}
              {j.analyses.map((a) => (
                <Button key={a} size="sm" variant="outline">
                  {a === "risk"
                    ? HOME_TEXT.analysisRisk
                    : a === "competition"
                      ? HOME_TEXT.analysisCompetition
                      : HOME_TEXT.analysisPolicy}
                </Button>
              ))}
              <Button size="sm" variant="ghost">
                {HOME_TEXT.actDismiss}
              </Button>
              {j.analyses.length > 0 ? (
                <span className="text-muted-foreground ml-auto text-xs">
                  {HOME_TEXT.analysisHint}
                </span>
              ) : null}
            </Stack>
          </Stack>
        </CollapsibleContent>
      </PanelCard>
    </Collapsible>
  );
}

/**
 * Rule or model, and what each means for how to read the claim.
 *
 * Not decoration and not attribution: it tells the reader which kind of
 * scrutiny applies. The tooltip carries the short version of that, so it is
 * available without opening anything.
 */
function SourceMark({ source }: { source: Judgement["source"] }) {
  const rule = source === "rule";
  return (
    <Badge
      variant={rule ? "outline" : "default"}
      title={rule ? HOME_TEXT.sourceRuleHint : HOME_TEXT.sourceModelHint}
    >
      {rule ? HOME_TEXT.sourceRule : HOME_TEXT.sourceModel}
    </Badge>
  );
}
