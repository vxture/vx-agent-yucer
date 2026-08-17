"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FactList,
  SectionHeader,
  SegmentedControl,
  SplitViewLayout,
  Stack,
  StatusBadge,
  Textarea,
} from "@vxture/design-ui";
import { HOME_TEXT } from "../lib/messages";
import type { Judgement, Urgency } from "../../domains/judgement/lib/judgement";

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
  readonly canRecord: boolean;
  readonly onRecord?: (text: string) => Promise<{ ok: boolean; error?: string }>;
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

export function JudgementWorkspace({
  judgements,
  counts,
  scanned,
  scope,
  hasAnyRecord,
  canRecord,
  onRecord,
}: JudgementWorkspaceProps) {
  const [tier, setTier] = useState<Tier>("all");
  const [selectedId, setSelectedId] = useState<string>(judgements[0]?.id ?? "");

  const shown = tier === "all" ? judgements : judgements.filter((j) => j.urgency === tier);
  // Falls back to the first visible row rather than to nothing: filtering to a
  // tier the selected row is not in must not blank the case pane.
  const selected = shown.find((j) => j.id === selectedId) ?? shown[0];

  return (
    <Stack gap="lg">
      <SplitViewLayout
        header={
          <Stack gap="md">
            <div className="flex flex-wrap items-end justify-between gap-md">
              <div className="min-w-0">
                {/* The agent's own opening sentence, sized like a statement.
                    The screen used to open with the label "今日判断" over a grey
                    line of provenance, which is a drawer tag on a filing
                    cabinet. */}
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
          </Stack>
        }
        navigation={
          shown.length === 0 ? null : (
            <nav aria-label={HOME_TEXT.queueLabel}>
              <Stack gap="xs">
                {shown.map((j) => (
                  <QueueRow
                    key={j.id}
                    judgement={j}
                    selected={selected?.id === j.id}
                    onSelect={() => setSelectedId(j.id)}
                  />
                ))}
              </Stack>
            </nav>
          )
        }
        content={
          selected ? (
            <JudgementCase judgement={selected} />
          ) : (
            <EmptyState
              title={HOME_TEXT.emptyTitle}
              // Two different silences. "Nothing is wrong" and "nothing has
              // been recorded, so nothing can be concluded" look identical on a
              // screen and mean opposite things.
              description={hasAnyRecord ? HOME_TEXT.emptyDescription : HOME_TEXT.emptyNoRecords}
            />
          )
        }
      />

      {canRecord ? <CaptureBar onRecord={onRecord} /> : null}
    </Stack>
  );
}

/**
 * One line in the queue.
 *
 * Deliberately terse: the subject, the tier and how it was reached. A queue row
 * exists to be chosen between, not to be read - the claim it stands for is two
 * lines at most, and everything that justifies it lives in the case pane.
 */
function QueueRow({
  judgement: j,
  selected,
  onSelect,
}: {
  judgement: Judgement;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={[
        "w-full rounded-md px-sm py-sm text-left transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/50",
      ].join(" ")}
    >
      <div className="flex items-center gap-xs">
        <StatusBadge tone={TIER_TONE[j.urgency]} dot>
          {TIER_LABEL[j.urgency]}
        </StatusBadge>
        <SourceMark source={j.source} />
      </div>
      {/* The SUBJECT leads. A queue is chosen between, and you choose by which
          customer it is about - repeating the full claim here just prints the
          case pane's headline twice. */}
      <p className="text-foreground mt-xs truncate text-label-md">{j.subjectName}</p>
      <p className="text-muted-foreground line-clamp-2 text-body-sm">{j.claim}</p>
    </button>
  );
}

/**
 * The selected judgement, in full.
 *
 * This pane is the widest thing on the screen and the evidence is why. Every
 * downstream claim cites these rows, so what a reader can open must be what was
 * cited - which means room to show all of it, unabridged, rather than the "one
 * quote plus a count" the list version needed to stay a manageable height.
 */
function JudgementCase({ judgement: j }: { judgement: Judgement }) {
  const href =
    j.subjectType === "account"
      ? `/account/${j.subjectId}`
      : j.subjectType === "opportunity"
        ? `/pipeline/${j.subjectId}`
        : "/admin/adoption";

  return (
    // Capped. The pane is the widest thing on the screen because the evidence
    // needs room, but "as wide as available" is not a measure - unbounded, the
    // facts rail ended up 400px from the claim it qualifies.
    <Stack gap="lg" className="max-w-[1024px]">
      <div className="flex flex-wrap items-start gap-xl">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-xs">
            <StatusBadge tone={TIER_TONE[j.urgency]} dot>
              {TIER_LABEL[j.urgency]}
            </StatusBadge>
            <SourceMark source={j.source} />
            {j.tags.map((t, i) =>
              // "neutral" is not a status, it is the ABSENCE of one, and
              // StatusBadge draws the tone's icon unconditionally - neutral's is
              // a dash, which put a leading "-" on every descriptive chip.
              t.tone && t.tone !== "neutral" ? (
                <StatusBadge key={i} tone={t.tone}>
                  {t.label ? `${t.label} ${t.value}` : t.value}
                </StatusBadge>
              ) : (
                <Badge key={i} variant="outline">
                  {t.label ? `${t.label} ${t.value}` : t.value}
                </Badge>
              ),
            )}
          </div>
          {/* Capped at a measure. A claim allowed to run the full width of this
              pane would set a line roughly twice as long as anyone reads
              comfortably. */}
          <p className="text-foreground mt-sm max-w-[54ch] text-heading-4">{j.claim}</p>
        </div>

        {j.facts.length > 0 ? (
          <div className="w-56 shrink-0">
            <FactList
              facts={j.facts.map((f) => ({ label: f.label, value: f.value, tone: f.tone }))}
            />
          </div>
        ) : null}
      </div>

      {j.citations.length > 0 ? (
        <section>
          <SectionHeader level={4} title={HOME_TEXT.secEvidenceCount(j.citations.length)} />
          <Stack gap="sm" className="mt-sm">
            {j.citations.map((c, i) => (
              // Verbatim, and all of them. A tidied summary here would make
              // provenance a story rather than a record.
              <blockquote key={i} className="border-border max-w-[62ch] border-l-2 pl-sm">
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

      {j.rule ? (
        <section>
          <SectionHeader level={4} title={HOME_TEXT.secRule} />
          {/* Shown so a reader can disagree with the arithmetic rather than
              with the conclusion. A rule that hides its condition is an opinion
              wearing a formula's clothes. */}
          <code className="bg-muted text-muted-foreground mt-xs block max-w-[62ch] rounded-md px-sm py-xs text-xs">
            {j.rule}
          </code>
        </section>
      ) : null}

      <Stack gap="xs" className="flex-row flex-wrap items-center">
        <Button size="sm" asChild>
          <Link href={href}>{HOME_TEXT.openSubject}</Link>
        </Button>
        {/* Analyses are deliberately quieter than the decision: one looks again,
            the other files a proposal a person must sign. */}
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
          <span className="text-muted-foreground ml-auto text-xs">{HOME_TEXT.analysisHint}</span>
        ) : null}
      </Stack>
    </Stack>
  );
}

/**
 * Capture, as a bar.
 *
 * It belongs to no single judgement, which is why it is not inside the case
 * pane. It also does not deserve a standing column: writing a note is a
 * one-second act, and the panel it used to live in could never be filled.
 */
function CaptureBar({
  onRecord,
}: {
  onRecord?: (text: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [text, setText] = useState("");
  const [pendingSave, start] = useTransition();

  return (
    <Card className="p-sm">
      <div className="flex items-end gap-sm">
        <Textarea
          className="min-h-11 flex-1 resize-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={HOME_TEXT.agentPlaceholder}
          disabled={pendingSave}
        />
        <Button
          disabled={pendingSave || text.trim() === "" || !onRecord}
          onClick={() =>
            start(() => {
              void onRecord?.(text).then((r) => {
                if (r.ok) setText("");
              });
            })
          }
        >
          {HOME_TEXT.agentSend}
        </Button>
      </div>
      <p className="text-muted-foreground mt-xs text-xs">{HOME_TEXT.agentHelp}</p>
    </Card>
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
