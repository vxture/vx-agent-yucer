"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  FactList,
  Icon,
  PanelList,
  SectionHeader,
  SegmentedControl,
  Separator,
  Stack,
  StatusBadge,
} from "@vxture/design-ui";
import { HOME_TEXT } from "../lib/messages";
import type { Judgement, Urgency } from "../../domains/judgement/lib/judgement";

// The home screen's stream.
//
// REBUILT as a queue of rows, after the card version rendered as a wall of
// slabs: three heavy boxes, each with a full-width coloured bar across the top
// and a stack of red label/value lines, on a page that was 40% empty below.
// Every one of those was a defensible component choice and the result was
// unreadable, which is the whole argument for looking at the rendered page.
//
// What changed and why:
//
//   rows, not cards   PanelList divides with hairlines. Boxes fragment a list
//                     into unrelated objects; a queue you work through should
//                     read as one surface.
//   a dot, not a bar  urgency is a StatusBadge dot beside the claim, so it
//                     labels the sentence instead of painting the container.
//   one quote open    evidence used to dump three verbatim notes at once and
//                     made the first item 600px tall. The most recent is
//                     shown; the rest are behind a count.
//   facts in a line   they were a vertical stack of coloured pairs that read
//                     as a debug dump.
//
// THE SOURCE MARKER IS STILL LOAD-BEARING. A rule judgement shows its trigger
// condition, so you can recompute it and disagree with the arithmetic. A model
// judgement shows which notes it cited, because you cannot recompute it and the
// only check available is whether those notes say what it claims. Rendering
// them identically would teach people to trust both or neither.

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

const TIER_LABEL: Record<Urgency, string> = {
  today: HOME_TEXT.urgencyToday,
  week: HOME_TEXT.urgencyWeek,
  watch: HOME_TEXT.urgencyWatch,
};

export function JudgementStream({
  judgements,
  counts,
  scanned,
  scope,
  hasAnyRecord,
}: JudgementStreamProps) {
  const [tier, setTier] = useState<Tier>("all");
  // One id for the whole queue, so opening a row closes the previous one
  // without any row needing to know the others exist.
  const [openId, setOpenId] = useState<string>(judgements[0]?.id ?? "");

  const shown = tier === "all" ? judgements : judgements.filter((j) => j.urgency === tier);

  return (
    <Stack gap="lg">
      {/* The opening sentence is the agent's, and it is sized like a statement
          rather than like a page title, because that is what it is. */}
      <Stack gap="md">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div className="min-w-0">
            <h1 className="text-heading-2 text-foreground">
              {counts.today > 0 ? HOME_TEXT.lead(counts.today) : HOME_TEXT.leadNone}
            </h1>
            <p className="text-muted-foreground mt-2xs text-body-sm">
              {HOME_TEXT.leadSub(scanned, judgements.length)}
            </p>
          </div>

          <Stack gap="xs" className="flex-row flex-wrap items-center">
            <SegmentedControl
              ariaLabel={HOME_TEXT.scopeLabel}
              value={scope}
              onChange={(v) => {
                // Both branches explicit: a bare URL would re-enter the
                // ownership derivation and could land somewhere other than
                // where the reader just clicked.
                window.location.search = v === "all" ? "?scope=all" : "?scope=mine";
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
        </div>
        <Separator />
      </Stack>

      {shown.length === 0 ? (
        <EmptyState
          title={HOME_TEXT.emptyTitle}
          // Two different silences. "Nothing is wrong" and "nothing has been
          // recorded, so nothing can be concluded" look identical on a screen
          // and mean opposite things.
          description={hasAnyRecord ? HOME_TEXT.emptyDescription : HOME_TEXT.emptyNoRecords}
        />
      ) : (
        <PanelList>
          {shown.map((j) => (
            <JudgementRow
              key={j.id}
              judgement={j}
              open={openId === j.id}
              onToggle={() => setOpenId(openId === j.id ? "" : j.id)}
            />
          ))}
        </PanelList>
      )}
    </Stack>
  );
}

function JudgementRow({
  judgement: j,
  open,
  onToggle,
}: {
  judgement: Judgement;
  open: boolean;
  onToggle: () => void;
}) {
  const [allEvidence, setAllEvidence] = useState(false);

  const href =
    j.subjectType === "account"
      ? `/account/${j.subjectId}`
      : j.subjectType === "opportunity"
        ? `/pipeline/${j.subjectId}`
        : "/admin/adoption";

  const quotes = allEvidence ? j.citations : j.citations.slice(0, 1);
  const hidden = j.citations.length - quotes.length;

  return (
    <div className="py-md">
      <div className="flex min-w-0 items-start gap-xl">
        {/* The reading column is capped at a measure, not left to stretch. At
            1920 the claim and its evidence ran ~900px wide - roughly double a
            readable line - because flex-1 hands a text column all the width
            there is. Width is for putting things BESIDE each other. */}
        {/* flex-1 with NO max-width: the container must keep absorbing the
            spare width, or the row packs left and leaves a dead strip at the
            right edge. The measure is capped on the TEXT instead - that is
            what needed a limit. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-xs">
            {/* The dot labels the sentence. The card version painted the whole
                container with this tone, which shouted the tier and buried the
                claim it was supposed to qualify. */}
            <StatusBadge tone={TIER_TONE[j.urgency]} dot>
              {TIER_LABEL[j.urgency]}
            </StatusBadge>
            <SourceMark source={j.source} />
          </div>

          <p className="text-foreground mt-xs max-w-[62ch] text-body-md">{j.claim}</p>
        </div>

        {/* The facts, BESIDE the claim rather than under it. This is what the
            spare width is for: the row now says what it concluded and what it
            counted at the same altitude, and the reader compares them by
            looking across rather than by scrolling. Hidden on narrow screens,
            where there is no width to spend and they fall back under the
            claim.

            Fixed width so the rail forms a COLUMN down the queue: facts you
            cannot compare across rows are just decoration beside each one.

            The breakpoint is 2xl, not lg. lg (1024px) measures the WINDOW, but
            what has to fit is this column - and it already shares the window
            with a 280px nav and a 450px agent panel. At 1180 the rail took its
            224px, the claim was squeezed to a few dozen pixels, and the
            sentence rendered one character per line. */}
        {j.facts.length > 0 ? (
          <div className="hidden w-56 shrink-0 2xl:block">
            <FactList facts={j.facts.slice(0, 4).map((f) => ({ label: f.label, value: f.value, tone: f.tone }))} />
          </div>
        ) : null}

        <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>
          {open ? HOME_TEXT.collapse : HOME_TEXT.expand}
          <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
        </Button>
      </div>

      {j.facts.length > 0 ? (
        <p className="text-muted-foreground mt-xs text-body-sm 2xl:hidden">
          {j.facts
            .slice(0, 4)
            .map((f) => HOME_TEXT.factInline(f.label, f.value))
            .join(HOME_TEXT.factJoin)}
        </p>
      ) : null}

      {open ? (
        // Indented to the claim it belongs to, so an open row reads as one
        // thing rather than as a new section.
        <Stack gap="md" className="mt-md max-w-[62ch] pl-md">
          {quotes.length > 0 ? (
            <section>
              <SectionHeader level={4} title={HOME_TEXT.secEvidenceCount(j.citations.length)} />
              <Stack gap="sm" className="mt-xs">
                {quotes.map((c, i) => (
                  // Verbatim. Everything downstream cites these rows, so what a
                  // reader can open must be what was cited - a tidied summary
                  // here would make provenance a story.
                  <blockquote key={i} className="border-border border-l-2 pl-sm">
                    {c.who ? (
                      <cite className="text-muted-foreground block text-xs not-italic tabular-nums">
                        {c.who}
                      </cite>
                    ) : null}
                    <p className="text-muted-foreground text-body-sm leading-relaxed">{c.text}</p>
                  </blockquote>
                ))}
                {hidden > 0 || allEvidence ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => setAllEvidence(!allEvidence)}
                  >
                    {allEvidence ? HOME_TEXT.evidenceLess : HOME_TEXT.evidenceMore(hidden)}
                  </Button>
                ) : null}
              </Stack>
            </section>
          ) : null}

          {j.rule ? (
            <section>
              <SectionHeader level={4} title={HOME_TEXT.secRule} />
              {/* Shown so a reader can disagree with the arithmetic rather than
                  with the conclusion. A rule that hides its condition is an
                  opinion wearing a formula's clothes. */}
              <code className="bg-muted text-muted-foreground mt-xs block rounded-md px-sm py-xs text-xs">
                {j.rule}
              </code>
            </section>
          ) : null}

          <Stack gap="xs" className="flex-row flex-wrap items-center">
            <Button size="sm" asChild>
              <Link href={href}>{HOME_TEXT.openSubject}</Link>
            </Button>
            {/* Analyses are deliberately quieter than the decision: one looks
                again, the other files a proposal a person must sign. They must
                not weigh the same. */}
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
          </Stack>
        </Stack>
      ) : null}
    </div>
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
      variant="outline"
      title={rule ? HOME_TEXT.sourceRuleHint : HOME_TEXT.sourceModelHint}
    >
      {rule ? HOME_TEXT.sourceRule : HOME_TEXT.sourceModel}
    </Badge>
  );
}
