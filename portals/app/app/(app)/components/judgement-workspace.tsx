"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
  Icon,
  PanelCard,
  SectionHeader,
  SegmentedControl,
  Stack,
  StatusBadge,
  ViewHeader,
} from "@vxture/design-ui";
import { dismissJudgement } from "../judgement-actions";
import type {
  AnalysisKind,
  Judgement,
  Urgency,
} from "../../domains/judgement/lib/judgement";
import { TONE_INK } from "../lib/view-model";

import { useMessages } from "../lib/i18n/provider";
import type { Dictionary } from "../lib/i18n/dictionary";
// The home screen: a decision queue with provenance.
//
// THE SHAPE IS ONE CASE PER PANEL. The job is to take someone from "N open
// questions" to "0", one at a time, and each question is a case to be checked
// rather than a row in a report - so each gets its own bounded panel, its own
// heading, and its own drawer of evidence.
//
// THIS REPLACES A SINGLE CARD holding every judgement as a hairline-separated
// strip. That version read as one undifferentiated block: the boundary between
// two cases was a 1px line, and an expanded drawer flowed into the same surface
// as the next case's summary, so "where does this one end" had no answer.
//
// THE OLD OBJECTION TO EXPANDING IN PLACE, and what answers it now. The note
// this comment replaces argued that opening an item pushes the rest down and
// you lose your place. That is true of an undifferentiated list, and two things
// answer it here: only ONE panel is open at a time, so the page never grows by
// more than one drawer; and the reader's anchor is now a titled panel with a
// coloured top edge rather than a position in a stack of identical rows. You
// return to a named thing, not to an offset.
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
 *  silent fallthrough to whatever the last branch was.
 *
 *  FUNCTIONS OF THE DICTIONARY, not module constants: they are made of copy,
 *  and a module constant would freeze one language at import time. */
const analysisLabels = (
  t: Dictionary["HOME_TEXT"],
): Record<AnalysisKind, string> => ({
  risk: t.analysisRisk,
  competition: t.analysisCompetition,
  policy: t.analysisPolicy,
  chain: t.analysisChain,
});

const tierLabels = (t: Dictionary["HOME_TEXT"]): Record<Urgency, string> => ({
  today: t.urgencyToday,
  week: t.urgencyWeek,
  watch: t.urgencyWatch,
});

export function JudgementWorkspace({
  judgements,
  counts,
  scanned,
  scope,
  hasAnyRecord,
}: JudgementWorkspaceProps) {
  const { BOARD_TEXT, CHANNEL_LABEL, HOME_TEXT } = useMessages();
  const [tier, setTier] = useState<Tier>("all");
  // One id for the whole stack, so opening a row closes the previous one
  // without any row needing to know the others exist.
  const [openId, setOpenId] = useState<string>(judgements[0]?.id ?? "");

  const shown =
    tier === "all" ? judgements : judgements.filter((j) => j.urgency === tier);

  return (
    <Stack gap="md">
      {/* THE PAGE HEADER IS THE DS ONE, and lifted out of the queue. It used to
          be an h1 inside the card that held the judgements, which read as a page
          title bolted onto a container and put this page's heading at a
          different height from every other page's. ViewHeader is what
          ListPageTemplate calls its header slot, so this page now sits at the
          same altitude as the rest. */}
      <ViewHeader
        title={
          counts.today > 0 ? HOME_TEXT.lead(counts.today) : HOME_TEXT.leadNone
        }
        // The analysis hint used to sit on EVERY panel that offered an
        // analysis - the same sentence, five times down one screen, eating the
        // right end of five rows. It is a fact about how this page works, not
        // about any one case, so it is said once here.
        description={
          <>
            <span className="block">
              {HOME_TEXT.leadSub(scanned, judgements.length)}
            </span>
            <span className="block">{BOARD_TEXT.analysisNote}</span>
          </>
        }
        action={
          <Stack gap="xs" className="flex-row flex-wrap items-center">
            <SegmentedControl
              ariaLabel={HOME_TEXT.scopeLabel}
              value={scope}
              onChange={(v) => {
                // Both branches explicit: a bare URL would re-enter the
                // ownership derivation and could land somewhere other than
                // where the reader just clicked.
                window.location.search =
                  v === "all" ? "?scope=all" : "?scope=mine";
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
                {
                  value: "all",
                  label: HOME_TEXT.urgencyAll,
                  count: judgements.length,
                },
                {
                  value: "today",
                  label: HOME_TEXT.urgencyToday,
                  count: counts.today,
                },
                {
                  value: "week",
                  label: HOME_TEXT.urgencyWeek,
                  count: counts.week,
                },
                {
                  value: "watch",
                  label: HOME_TEXT.urgencyWatch,
                  count: counts.watch,
                },
              ]}
            />
          </Stack>
        }
      />

      {shown.length === 0 ? (
        <Card className="p-lg">
          <EmptyState
            title={HOME_TEXT.emptyTitle}
            // Two different silences. "Nothing is wrong" and "nothing has been
            // recorded, so nothing can be concluded" look identical on a screen
            // and mean opposite things.
            description={
              hasAnyRecord
                ? HOME_TEXT.emptyDescription
                : HOME_TEXT.emptyNoRecords
            }
          />
        </Card>
      ) : (
        <Stack gap="md">
          {shown.map((j) => (
            <Engagement
              key={j.id}
              judgement={j}
              open={openId === j.id}
              onToggle={() => setOpenId(openId === j.id ? "" : j.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * One case, in its own panel.
 *
 * THE COLLAPSED STATE IS STILL THE POINT. The panel closed carries who and how
 * urgent, what the agent concluded, the numbers behind it and the orders - so
 * the common decisions never require opening anything. Expanding is for
 * CHECKING the claim, not for acting on it, and separating those two is what
 * lets a closed panel still be useful.
 *
 * WHY PanelCard AND NOT A ROW. `tone` colours the top edge only, which is
 * exactly the weight urgency should carry here: enough to sort the page at a
 * glance, not enough to shout over the evidence. The badge still says the word,
 * because a colour alone is not a label.
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
  const { CHANNEL_LABEL, HOME_TEXT } = useMessages();
  const [pendingDismiss, startDismiss] = useTransition();

  const href =
    j.subjectType === "account"
      ? `/account/${j.subjectId}`
      : j.subjectType === "opportunity"
        ? `/pipeline/${j.subjectId}`
        : "/admin/adoption";

  return (
    // The Collapsible ROOT wraps the whole panel so the trigger can sit in the
    // header slot while the drawer stays in the body - both are descendants of
    // one root, which is what radix needs and what keeps the open state in one
    // place rather than duplicated across two components.
    <Collapsible open={open} onOpenChange={onToggle}>
      <PanelCard
        tone={TIER_TONE[j.urgency]}
        title={j.subjectName}
        titleSuffix={
          <span className="flex flex-wrap items-center gap-xs">
            <StatusBadge tone={TIER_TONE[j.urgency]} dot>
              {tierLabels(HOME_TEXT)[j.urgency]}
            </StatusBadge>
            <SourceMark source={j.source} />
          </span>
        }
        // The conclusion, in the slot a panel gives its own subtitle. It is the
        // one sentence a reader must take away if they open nothing.
        description={j.claim}
        action={
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" aria-expanded={open}>
              {open ? HOME_TEXT.collapse : HOME_TEXT.expand}
              <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
            </Button>
          </CollapsibleTrigger>
        }
      >
        {/* ONE ROW: the numbers on the left, the orders on the right.
            
            MEASURED, not preferred. The facts used 375-539px of an 862px row
            and the orders sat on a row of their own beneath them, so every
            panel spent a whole line plus its margin on ~300px of buttons while
            487px of the line above stayed empty. Five of the six panels fit
            both on one line; the sixth wraps, which is what flex-wrap is for -
            two lines when the content needs two, rather than always.
            
            THE GAP IS SPLIT - `md` across, `xs` down. A single `gap-md` also
            applies BETWEEN wrapped lines, which made the narrow-viewport case
            (1024px, where the buttons do drop to a second line) 214px against
            the 208px the two-row layout cost there. Widening the reading gap
            between two rows nobody asked to separate is not a trade.
            
            It also puts the orders at a FIXED RIGHT EDGE down the page, so the
            button is in the same place on every panel instead of starting
            wherever the previous panel's facts happened to end. That is the
            division signal-queue.tsx already states in its own header: left is
            what the thing IS, right is how it is JUDGED. */}
        <div className="flex flex-wrap items-center gap-x-md gap-y-xs">
          {/* Only facts that ARE quantities get the big tabular treatment. Some
              are verdicts rather than amounts - "no missed promises", "yes" /
              "no" - and setting a word at figure size in a row of numbers makes
              the reader parse it as one. */}
          {j.facts.slice(0, 4).map((f, i) => (
            <span key={i} className="flex items-baseline gap-2xs">
              <b
                className={[
                  /^[0-9]/.test(f.value)
                    ? "text-label-lg tabular-nums"
                    : "text-body-sm",
                  f.tone === "danger"
                    ? TONE_INK.danger
                    : f.tone === "warning"
                      ? TONE_INK.warning
                      : f.tone === "success"
                        ? TONE_INK.success
                        : "text-foreground",
                ].join(" ")}
              >
                {f.value}
              </b>
              <span className="text-muted-foreground text-xs">{f.label}</span>
            </span>
          ))}

          {/* The orders. Available WITHOUT expanding, because opening the
              subject or asking for an analysis are the ordinary moves - only
              checking the reasoning needs the drawer. `ml-auto` is what holds
              the right edge when the facts are short. */}
          <Stack gap="xs" className="ml-auto flex-row flex-wrap items-center">
            <Button size="sm" asChild>
              {/* The team judgement is not an account, so it does not open a
              position - it opens the adoption board. Sending it to the same
              label would name the destination wrongly. */}
              <Link href={href}>
                {j.subjectType === "team"
                  ? HOME_TEXT.openTeam
                  : HOME_TEXT.openSubject}
              </Link>
            </Button>
            {j.analyses.map((a) => (
              <Button key={a} size="sm" variant="outline">
                {analysisLabels(HOME_TEXT)[a]}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={pendingDismiss}
              title={HOME_TEXT.actDismissHint}
              onClick={() =>
                startDismiss(() => {
                  void dismissJudgement(j.id, j.urgency);
                })
              }
            >
              {HOME_TEXT.actDismiss}
            </Button>
          </Stack>
        </div>

        {/* The drawer. CollapsibleContent rather than `open ? ... : null`: the
            trigger, the content and the aria wiring between them are then one
            component's business instead of three hand-kept pieces. */}
        <CollapsibleContent>
          <Stack gap="sm" className="mt-md">
            {j.citations.length > 0 ? (
              <section className="bg-muted/40 border-border rounded-md border p-sm">
                <SectionHeader
                  level={4}
                  title={HOME_TEXT.secEvidenceCount(j.citations.length)}
                />
                <Stack gap="sm" className="mt-xs">
                  {j.citations.map((c, i) => (
                    // Verbatim, and all of them. Everything downstream cites these
                    // rows, so what a reader can open must be what was cited - a
                    // tidied summary would make provenance a story.
                    <blockquote
                      key={i}
                      className="border-primary/40 max-w-[62ch] border-l-2 pl-sm"
                    >
                      {/* Composed here, from parts. The rule used to hand down
                        one finished string and the raw channel enum and subject
                        id went straight to the screen - "58 天前 · call ·
                        usr_demo_rep" - with no layer left that could label
                        them. CHANNEL_LABEL lives in this layer and always did.

                        The actor stays an id and is marked as one: there is no
                        directory to resolve it against, and a machine string
                        dressed as a person is how a UUID ends up in front of
                        someone who then does not chase it. */}
                      {c.daysAgo !== undefined ? (
                        <cite className="text-muted-foreground flex flex-wrap items-center gap-xs text-xs not-italic tabular-nums">
                          <span>
                            {HOME_TEXT.citedBy(
                              c.daysAgo,
                              c.channel
                                ? (CHANNEL_LABEL[c.channel] ?? c.channel)
                                : "",
                            )}
                          </span>
                          {c.actorSub ? (
                            <span className="font-mono">{c.actorSub}</span>
                          ) : null}
                        </cite>
                      ) : null}
                      <p className="text-muted-foreground text-body-sm leading-relaxed">
                        {c.text}
                      </p>
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
                      <div
                        key={pt.label}
                        className="flex min-w-0 flex-col items-center gap-2xs"
                      >
                        <span
                          className={[
                            "text-xs tabular-nums",
                            last
                              ? "text-foreground font-semibold"
                              : "text-muted-foreground",
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
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {pt.label}
                        </span>
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
        </CollapsibleContent>
      </PanelCard>
    </Collapsible>
  );
}

function SourceMark({ source }: { source: Judgement["source"] }) {
  const { HOME_TEXT } = useMessages();
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
