"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  SectionHeader,
  SegmentedControl,
  Stack,
  StatusBadge,
} from "@vxture/design-ui";
import { HOME_TEXT } from "../lib/messages";
import type { AnalysisKind, Judgement, Urgency } from "../../domains/judgement/lib/judgement";

// The home screen: a decision queue with provenance.
//
// THE SHAPE IS AN INBOX, NOT A DASHBOARD. The job this screen exists for is to
// take someone from "N open questions" to "0", one at a time, and the proven
// form for that is master-detail. Three things made it the right shape here
// rather than a generically nice one:
//
//   1. Evidence has to be read VERBATIM to be checked, and verbatim quotes need
//      a measure and vertical room. The detail pane can give them both.
//   2. In the expanding-list version, opening an item pushed everything below
//      it down and you lost your place in the queue. Triage you lose your place
//      in is not triage.
//   3. The queue stays visible, so how many remain is always answerable. That
//      is what makes clearing it feel finishable.
//
// THE AGENT HAS NO PANEL, deliberately. It used to own a 450px column beside
// its own output, which said the same identity twice and could never be filled
// - so it always rendered as a large empty rectangle. The agent speaks through
// the opening sentence, through every rule/model marker, and through the queue
// itself. Capture is a one-second verb and gets a bar, not standing real estate.
//
// THE SOURCE MARKER IS LOAD-BEARING. A rule judgement shows its trigger
// condition, so you can recompute it and disagree with the arithmetic. A model
// judgement shows which notes it cited, because you cannot recompute it and the
// only check available is whether those notes say what it claims. Rendering
// them identically would teach people to trust both or neither.

export interface JudgementWorkspaceProps {
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

/** One entry per kind, so adding a kind is a compile error rather than a
 *  silent fallthrough to whatever the last branch was. */
const ANALYSIS_LABEL: Record<AnalysisKind, string> = {
  risk: HOME_TEXT.analysisRisk,
  competition: HOME_TEXT.analysisCompetition,
  policy: HOME_TEXT.analysisPolicy,
  chain: HOME_TEXT.analysisChain,
};

const TIER_LABEL: Record<Urgency, string> = {
  today: HOME_TEXT.urgencyToday,
  week: HOME_TEXT.urgencyWeek,
  watch: HOME_TEXT.urgencyWatch,
};

export function JudgementWorkspace({
  judgements,
  counts,
  scanned,
  scope,
  hasAnyRecord,
}: JudgementWorkspaceProps) {
  const [tier, setTier] = useState<Tier>("all");
  // One id for the whole stack, so opening a row closes the previous one
  // without any row needing to know the others exist.
  const [openId, setOpenId] = useState<string>(judgements[0]?.id ?? "");

  const shown = tier === "all" ? judgements : judgements.filter((j) => j.urgency === tier);

  return (
    // ONE card. The headline used to float above the content as its own block,
    // which read as a page title bolted onto an unrelated container - the
    // sentence is the agent speaking about exactly what is inside.
    <Card className="overflow-hidden">
      <div className="border-border flex flex-wrap items-end justify-between gap-md border-b px-lg py-md">
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
              // Both branches explicit: a bare URL would re-enter the ownership
              // derivation and could land somewhere other than where the reader
              // just clicked.
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

      {shown.length === 0 ? (
        <div className="p-lg">
          <EmptyState
            title={HOME_TEXT.emptyTitle}
            // Two different silences. "Nothing is wrong" and "nothing has been
            // recorded, so nothing can be concluded" look identical on a screen
            // and mean opposite things.
            description={hasAnyRecord ? HOME_TEXT.emptyDescription : HOME_TEXT.emptyNoRecords}
          />
        </div>
      ) : (
        <div className="flex flex-col">
          {shown.map((j) => (
            <Engagement
              key={j.id}
              judgement={j}
              open={openId === j.id}
              onToggle={() => setOpenId(openId === j.id ? "" : j.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * One engagement, stacked.
 *
 * THE COLLAPSED STATE IS THE POINT. It keeps three rows - who and how urgent,
 * what the agent concluded, and the numbers behind it, then the orders - so the
 * common decisions never require opening anything. Expanding is for CHECKING
 * the claim, not for acting on it, and separating those two is what lets a
 * closed row still be useful.
 *
 * A split view put the queue and the case at the same altitude and made a
 * reader hold two places at once. Stacked, there is only ever one place.
 */
function Engagement({
  judgement: j,
  open,
  onToggle,
}: {
  judgement: Judgement;
  open: boolean;
  onToggle: () => void;
}) {
  const href =
    j.subjectType === "account"
      ? `/account/${j.subjectId}`
      : j.subjectType === "opportunity"
        ? `/pipeline/${j.subjectId}`
        : "/admin/adoption";

  return (
    <article
      className={[
        "border-border border-b px-lg py-md last:border-b-0",
        open ? "bg-accent/40" : "",
      ].join(" ")}
    >
      {/* Row 1: who, how urgent, how it was reached - and the numbers. */}
      <div className="flex flex-wrap items-center gap-xs">
        <StatusBadge tone={TIER_TONE[j.urgency]} dot>
          {TIER_LABEL[j.urgency]}
        </StatusBadge>
        <SourceMark source={j.source} />
        <span className="text-foreground text-label-md">{j.subjectName}</span>

        <div className="ml-auto flex flex-wrap items-baseline gap-md">
          {/* Only facts that ARE quantities get the big tabular treatment. Some
              are verdicts rather than amounts - "no missed promises", "yes" /
              "no" - and setting a word at figure size in a row of numbers makes
              the reader parse it as one. */}
          {j.facts.slice(0, 4).map((f, i) => (
            <span key={i} className="flex items-baseline gap-2xs">
              <b
                className={[
                  /^[0-9]/.test(f.value) ? "text-label-lg tabular-nums" : "text-body-sm",
                  f.tone === "danger"
                    ? "text-destructive"
                    : f.tone === "warning"
                      ? "text-warning"
                      : f.tone === "success"
                        ? "text-success"
                        : "text-foreground",
                ].join(" ")}
              >
                {f.value}
              </b>
              <span className="text-muted-foreground text-xs">{f.label}</span>
            </span>
          ))}
        </div>

        <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>
          {open ? HOME_TEXT.collapse : HOME_TEXT.expand}
          <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
        </Button>
      </div>

      {/* Row 2: what it concluded. */}
      <p className="text-foreground mt-xs max-w-[62ch] text-body-md">{j.claim}</p>

      {/* Row 3: the orders. Available WITHOUT expanding, because opening the
          subject or asking for an analysis are the ordinary moves - only
          checking the reasoning needs the drawer. */}
      <Stack gap="xs" className="mt-sm flex-row flex-wrap items-center">
        <Button size="sm" asChild>
          <Link href={href}>{HOME_TEXT.openSubject}</Link>
        </Button>
        {j.analyses.map((a) => (
          <Button key={a} size="sm" variant="outline">
            {ANALYSIS_LABEL[a]}
          </Button>
        ))}
        <Button size="sm" variant="ghost">
          {HOME_TEXT.actDismiss}
        </Button>
        {j.analyses.length > 0 ? (
          <span className="text-muted-foreground ml-auto text-xs">{HOME_TEXT.analysisHint}</span>
        ) : null}
      </Stack>

      {open ? (
        <Stack gap="sm" className="mt-md">
          {j.citations.length > 0 ? (
            <section className="bg-muted/40 border-border rounded-md border p-sm">
              <SectionHeader level={4} title={HOME_TEXT.secEvidenceCount(j.citations.length)} />
              <Stack gap="sm" className="mt-xs">
                {j.citations.map((c, i) => (
                  // Verbatim, and all of them. Everything downstream cites these
                  // rows, so what a reader can open must be what was cited - a
                  // tidied summary would make provenance a story.
                  <blockquote key={i} className="border-primary/40 max-w-[62ch] border-l-2 pl-sm">
                    {c.who ? (
                      <cite className="text-muted-foreground block text-xs not-italic tabular-nums">
                        {c.who}
                      </cite>
                    ) : null}
                    <p className="text-muted-foreground text-body-sm leading-relaxed">{c.text}</p>
                  </blockquote>
                ))}
              </Stack>
            </section>
          ) : null}

          {j.series && j.series.length > 1 ? (
            <section className="bg-muted/40 border-border rounded-md border p-sm">
              <SectionHeader level={4} title={HOME_TEXT.secSeries} />
              {/* A series compares a quantity against its OWN past, so the bars
                  share one baseline and the latest is the emphasised one. In
                  the metric row these six weeks read as six unrelated numbers. */}
              <div className="mt-sm flex items-end gap-sm">
                {j.series.map((pt, i) => {
                  const last = i === j.series!.length - 1;
                  return (
                    <div key={pt.label} className="flex min-w-0 flex-col items-center gap-2xs">
                      <span
                        className={[
                          "text-xs tabular-nums",
                          last ? "text-foreground font-semibold" : "text-muted-foreground",
                        ].join(" ")}
                      >
                        {pt.percent}%
                      </span>
                      <div
                        className={[
                          "w-8 rounded-sm",
                          last ? "bg-primary" : "bg-primary/30",
                        ].join(" ")}
                        style={{ height: `${Math.max(4, pt.percent)}px` }}
                      />
                      <span className="text-muted-foreground text-xs tabular-nums">{pt.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {j.rule ? (
            <section className="bg-muted/40 border-border rounded-md border p-sm">
              <SectionHeader level={4} title={HOME_TEXT.secRule} />
              {/* Shown so a reader can disagree with the arithmetic rather than
                  with the conclusion. A rule that hides its condition is an
                  opinion wearing a formula's clothes. */}
              <code className="bg-card text-muted-foreground mt-xs block max-w-[62ch] rounded-md px-sm py-xs text-xs">
                {j.rule}
              </code>
            </section>
          ) : null}
        </Stack>
      ) : null}
    </article>
  );
}

function SourceMark({ source }: { source: Judgement["source"] }) {
  const rule = source === "rule";
  return (
    <Badge variant="outline" title={rule ? HOME_TEXT.sourceRuleHint : HOME_TEXT.sourceModelHint}>
      {rule ? HOME_TEXT.sourceRule : HOME_TEXT.sourceModel}
    </Badge>
  );
}
