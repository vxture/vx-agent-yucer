"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  FactList,
  Icon,
  PanelCard,
  PanelList,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import type { SignalRecord } from "../../domains/signal/store";
import {
  SIGNAL_STATUS_LABEL,
  SIGNAL_TEXT,
  SIGNAL_TYPE_LABEL,
} from "../lib/messages";
import { confidenceTone } from "../lib/view-model";
import { ScoreRing } from "./score-ring";

// The detective's queue.
//
// GROUPED BY LINE OF ENQUIRY, not sorted by score alone. ADR-016 puts targeting
// on the signal precisely so the inbox can be ordered by why we were looking,
// and keeps it OUT of the score so aim never decides what is true. The
// untargeted group is therefore shown rather than hidden: aim decides what to
// read first, never what is allowed in.
//
// THE ROW IS THREE LINES, AND EACH LINE READS LEFT TO RIGHT.
//
//   ring | 主题                        | 类别 · 推荐程度 · 状态
//        | 为什么是这个分                | 截止日期 · 额度
//        | 发现时间 · 来源               | 升级为线索 · 更多 · 展开
//
// Left is what the signal IS, right is how it is JUDGED - the same division on
// all three lines, so a reader scanning the right edge is reading one kind of
// thing. The columns are NOT a grid and deliberately do not align between
// items: each line sizes to its own content, because forcing a shared column
// width would let the longest subject in the list dictate the layout of every
// other row.
//
// WHAT THIS REPLACED, and why the height came down. The old row was a head
// (70px of content) plus a SEPARATE ACTION BAND underneath (mt-sm + 28px), so
// every row wore 71px of chrome around 70px of content, and twelve rows spent
// 456px on nothing but buttons. The actions now ride line three, where there
// was already vertical space paid for.
//
// THE SCORE IS TAKEN APART, still. It was a bare number, which asks a reader to
// trust an arithmetic they cannot see. The breakdown is RECOMPUTED from the
// stored inputs by the same pure rule, so it cannot drift from the definition -
// and its one-line form is now ON THE ROW rather than behind a click, because a
// number whose derivation costs a click is a number nobody checks.
//
// Recomputing has a second payoff: when today's recomputation differs from the
// stored score, the signal has decayed since it was scored. That is worth
// saying out loud rather than silently showing a stale number.
//
// An unmatched signal shows "new logo" and never a blank. An unrecognised
// company is the most valuable thing this domain finds, and rendering it as
// absence would teach people to skip exactly the rows worth reading.

export type SignalAction = "promote" | "dismiss" | "duplicate" | "rescore";

export interface QueueSignal {
  readonly record: SignalRecord;
  /** Recomputed now, from the same inputs the stored score came from. */
  readonly recomputed: number | null;
  readonly baseWeight: number;
  readonly decay: number;
  readonly bonus: number;
  readonly ageDays: number;
}

export interface SignalQueueProps {
  readonly groups: readonly {
    key: string;
    title: string;
    why: string;
    items: readonly QueueSignal[];
  }[];
  readonly canTriage: boolean;
  readonly canRescore: boolean;
  readonly onAct: (
    signalId: string,
    action: SignalAction,
  ) => void | Promise<unknown>;
}

/**
 * The verdict band, off the SAME thresholds the ring's colour comes from.
 *
 * Derived rather than stored so the badge and the arc cannot disagree. The old
 * code mapped tones by hand and tested for a "danger" that confidenceTone never
 * returns, so its info branch fell through to the success colour and a 65 was
 * painted the same green as an 85.
 */
function verdict(score: number | null): string {
  const tone = confidenceTone(score);
  if (score === null) return SIGNAL_TEXT.verdictUnknown;
  if (tone === "success") return SIGNAL_TEXT.verdictStrong;
  if (tone === "info") return SIGNAL_TEXT.verdictWorth;
  return SIGNAL_TEXT.verdictLater;
}

/**
 * Line two's right end: the objective readings.
 *
 * Deadline and budget would come from `payload`, which is an untyped
 * `Record<string, unknown>` and is `{}` on every row the product currently
 * produces - no ingestion writes them yet. So they are READ DEFENSIVELY and the
 * line falls back to the two facts that always exist: how old the signal is,
 * and whether its score has drifted since it was stored. The slot is wired, so
 * the day ingestion starts carrying a tender deadline it appears without a
 * further change here.
 */
function readings(s: QueueSignal): string[] {
  const out: string[] = [];
  const p = s.record.payload;

  const deadline = p["deadline"] ?? p["closesAt"];
  if (typeof deadline === "string" && deadline.length > 0) {
    out.push(SIGNAL_TEXT.fieldDeadline(deadline.slice(0, 10)));
  }
  const amount = p["amount"] ?? p["budget"];
  if (typeof amount === "number" && Number.isFinite(amount)) {
    out.push(SIGNAL_TEXT.fieldAmount(amount.toLocaleString("zh-CN")));
  }

  out.push(SIGNAL_TEXT.fieldAge(Math.round(s.ageDays)));

  // Only when it would actually move the row. Scores decay continuously, so a
  // one-point threshold flags essentially every row, and a marker that is
  // always on is a marker nobody reads.
  const drift =
    s.recomputed !== null && s.record.score !== null
      ? s.record.score - s.recomputed
      : 0;
  if (drift >= 5) out.push(SIGNAL_TEXT.fieldDrift(drift));

  return out;
}

export function SignalQueue({
  groups,
  canTriage,
  canRescore,
  onAct,
}: SignalQueueProps) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string>("");

  function act(id: string, action: SignalAction) {
    setBusyId(id);
    start(() => {
      void Promise.resolve(onAct(id, action)).finally(() => setBusyId(null));
    });
  }

  return (
    /* A named section, like every other block in the product. It was a bare div
       of grouped cards, so the page went from its headline straight into three
       unlabelled panels - the reader had to infer what they were a list OF. */
    <Section
      icon="lightbulb"
      title={SIGNAL_TEXT.title}
      description={SIGNAL_TEXT.description}
    >
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          /* GROUPS OPEN BY DEFAULT, and collapsible anyway. The reading order
             is the product's claim about what matters; folding the largest
             group by default would quietly turn that claim into a filter. But
             a reader working one line of enquiry needs to be able to put the
             other two away, so the control exists - it just starts open. */
          <Collapsible key={g.key} defaultOpen>
            <PanelCard
              title={g.title}
              description={g.why}
              action={
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {SIGNAL_TEXT.groupCount(g.items.length)}
                    <Icon name="chevron-down" size="xs" />
                  </Button>
                </CollapsibleTrigger>
              }
            >
              <CollapsibleContent>
                <PanelList>
                  {g.items.map((s) => (
                    <Row
                      key={s.record.id}
                      signal={s}
                      open={openId === s.record.id}
                      busy={pending && busyId === s.record.id}
                      canTriage={canTriage}
                      canRescore={canRescore}
                      onToggle={() =>
                        setOpenId(openId === s.record.id ? "" : s.record.id)
                      }
                      onAct={act}
                    />
                  ))}
                </PanelList>
              </CollapsibleContent>
            </PanelCard>
          </Collapsible>
        ))}
    </Section>
  );
}

function Row({
  signal: s,
  open,
  busy,
  canTriage,
  canRescore,
  onToggle,
  onAct,
}: {
  signal: QueueSignal;
  open: boolean;
  busy: boolean;
  canTriage: boolean;
  canRescore: boolean;
  onToggle: () => void;
  onAct: (id: string, a: SignalAction) => void;
}) {
  const r = s.record;
  const tone = confidenceTone(r.score);

  // Every verb is always PRESENT, disabled with a reason rather than absent.
  // A menu whose contents change with the viewer teaches nobody what the
  // product can do; a greyed item with a hint teaches them why they cannot.
  const menu = [
    {
      id: "duplicate",
      label: SIGNAL_TEXT.markDuplicate,
      icon: "copy" as const,
      disabled: !canTriage || busy,
      hint: canTriage ? undefined : SIGNAL_TEXT.noPermission,
      onSelect: () => onAct(r.id, "duplicate"),
    },
    {
      id: "rescore",
      label: SIGNAL_TEXT.rescore,
      icon: "refresh" as const,
      disabled: !canRescore || busy,
      hint: canRescore ? undefined : SIGNAL_TEXT.noRescorePermission,
      onSelect: () => onAct(r.id, "rescore"),
    },
    {
      id: "dismiss",
      label: SIGNAL_TEXT.dismiss,
      icon: "x" as const,
      danger: true,
      separatorBefore: true,
      disabled: !canTriage || busy,
      hint: canTriage ? undefined : SIGNAL_TEXT.noPermission,
      onSelect: () => onAct(r.id, "dismiss"),
    },
  ];

  return (
    <div className="flex min-w-0 items-start gap-md py-sm">
      {/* The lead rail. items-start rather than centre: the ring lines up with
          the subject it scores, not with the middle of three lines. */}
      <ScoreRing
        score={r.score}
        tone={tone}
        label={`${SIGNAL_TEXT.columnScore} ${r.score ?? "-"}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2xs">
        {/* L1 - CLASSED, then named, then measured.
            The tags lead the title rather than trailing it: they are how a
            reader decides whether to read the sentence at all, and a filter
            that comes after the thing it filters has already cost the reading
            it was meant to save. */}
        <div className="flex min-w-0 items-center justify-between gap-md">
          <span className="flex min-w-0 flex-1 items-center gap-xs">
            <StatusBadge tone="neutral">
              {SIGNAL_TYPE_LABEL[r.signalType] ?? r.signalType}
            </StatusBadge>
            <StatusBadge tone={tone}>{verdict(r.score)}</StatusBadge>
            {/* Never a blank: a company we do not recognise is the find. */}
            {r.accountId === null ? (
              <StatusBadge tone="brand">
                {SIGNAL_TEXT.unmatchedAccount}
              </StatusBadge>
            ) : null}
            <p className="text-foreground min-w-0 flex-1 truncate text-body-md">
              {r.subject}
            </p>
          </span>
          {/* The readings ride line one, beside the thing they measure. */}
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {readings(s).join(" \u00b7 ")}
          </span>
        </div>

        {/* L2 - the arithmetic behind the ring, and NOTHING on the right.
            The blank is deliberate. Three loaded right ends make a column of
            unrelated things that reads as a table it is not; leaving the
            middle one empty lets line one's readings and line three's verbs
            each be seen as what they are. */}
        <p className="text-muted-foreground min-w-0 truncate text-xs">
          {SIGNAL_TEXT.scoreExplain(s.baseWeight, s.decay, s.bonus)}
        </p>

        {/* L3 - where it came from | what to do about it. */}
        <div className="flex min-w-0 items-center justify-between gap-md">
          <p className="text-muted-foreground min-w-0 truncate text-xs">
            {SIGNAL_TEXT.detectedOn(
              r.detectedAt.toISOString().slice(0, 10),
              r.sourceRef ?? r.source,
            )}
          </p>
          <span className="flex shrink-0 items-center gap-xs">
            {/* THE STATUS IS THE HANDLE. It was a badge on line one saying
                "scored", sitting a whole row away from the arithmetic that
                word refers to - a label with nothing to do. As the drawer's
                trigger it says the same thing and also opens the thing it is
                talking about, and the chevron says which way. The word itself
                survives on the control's name, so nothing is lost to a reader
                who cannot see the icon. */}
            <Button
              variant="secondary"
              size="icon-sm"
              aria-expanded={open}
              onClick={onToggle}
              title={SIGNAL_STATUS_LABEL[r.status] ?? r.status}
              aria-label={`${SIGNAL_STATUS_LABEL[r.status] ?? r.status} \u00b7 ${
                open ? SIGNAL_TEXT.collapse : SIGNAL_TEXT.expand
              }`}
            >
              <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
            </Button>
            {/* The primary verb stays on the row. This is a triage queue:
                burying the one action it exists for behind a menu would cost a
                click on every single item. The other three are secondary and
                go where secondary actions go everywhere else in the product. */}
            <Button
              size="sm"
              disabled={!canTriage || busy}
              onClick={() => onAct(r.id, "promote")}
            >
              {SIGNAL_TEXT.promote}
            </Button>
            <ActionMenu items={menu} label={SIGNAL_TEXT.rowMenu} align="end" />
          </span>
        </div>

        {/* The drawer holds only what the three lines could not: the arithmetic
            term by term, and the staleness sentence. One row open at a time -
            two open drawers is a comparison nobody asked for. */}
        {open ? (
          <div className="bg-muted/40 border-border mt-2xs rounded-md border p-sm">
            <FactList
              facts={[
                { label: SIGNAL_TEXT.bdBase, value: String(s.baseWeight) },
                { label: SIGNAL_TEXT.bdDecay, value: s.decay.toFixed(2) },
                { label: SIGNAL_TEXT.bdBonus, value: String(s.bonus) },
                {
                  label: SIGNAL_TEXT.bdAge,
                  value: String(Math.round(s.ageDays)),
                },
              ]}
            />
            {s.recomputed !== null &&
            r.score !== null &&
            Math.abs(s.recomputed - r.score) >= 5 ? (
              <p className="text-warning mt-sm text-xs">
                {SIGNAL_TEXT.staleWhy(r.score, s.recomputed)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
