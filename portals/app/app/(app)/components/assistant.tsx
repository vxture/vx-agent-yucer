"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button, Card, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon, useToast } from "@vxture/design-ui";
import { ConfirmDestructive } from "./confirm-destructive";
import { useAssistantInteraction } from "./assistant-interaction";
import { ActionMenu } from "./business-controls";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

// THE ASSISTANT SURFACE - one grammar for everything the product's
// intelligence says, wherever it says it (owner ruling 2026-09-05).
//
// The problem it fixes, counted before it was written: six separate
// renderings of the same idea had accumulated - the dock's pending queue, its
// recon card, its recent notes, the price recommendations, the solution
// check, and the forms' smart fill. Each had invented its own markup for
// "here is something I noticed, here is why, here is what you can do about
// it", so they drifted in spacing, in verbs, and in whether a refusal was a
// toast or a badge. A page that adds intelligence should be choosing WHAT to
// say, never how a suggestion looks.
//
// THE SHAPE IS THE CONTRACT, and it comes from the AssistPanel rule this
// product already held: a recommendation without its evidence is an order.
// So an item is a sentence, its evidence, and at most three ways out:
//
//   act   - the AUTHORISED OUTLET. The assistant is not only where you ask;
//           it is where the product acts on your say-so, and every act goes
//           through the same gated server action a page would call. Nothing
//           here writes by itself.
//   link  - go decide by hand, when the answer needs a person.
//   more  - the ways of LOOKING (open the catalogue, see the history), kept
//           apart from the ways of acting.
//
// 忽略 IS A VIEW DISMISSAL and says so - it clears the row until the next
// read. Remembering a dismissal across sessions is a stored judgement (the
// snooze table's shape) and is deliberately not built here.

/** One thing the assistant has to say, and the ways out of it. */
export interface AssistantItem {
  readonly id: string;
  /** What it says, already a sentence in the reader's language (TD-010: the
   * rule layer emits codes, the dictionary writes this). */
  readonly text: string;
  /** WHY it says it. Optional in the type, expected in practice - the panel
   * is the product's argument, not its opinion. */
  readonly evidence?: string;
  readonly tone?: "info" | "warn" | "danger";
  /** The one-click act, gated server-side like any other write. */
  readonly act?: {
    readonly label: string;
    readonly run: () => Promise<{ ok: boolean; error?: string }>;
    /** Said on success - the product confirming what it did. */
    readonly done?: string;
    readonly confirm?: { readonly verb: string; readonly target: string; readonly consequence: string };
    /** THE MODULE'S OWN ERROR DICTIONARY (TD-010: the action returns a code,
     * this turns it into a sentence). Supplied by the panel because the panel
     * is the thing that knows which module's vocabulary a refusal belongs to.
     * This surface used to reach for the catalogue's dictionary for every act
     * on every page, which meant a plan's `illegal_transition` had to be filed
     * under the catalogue's words to be readable - found by
     * reachable-codes.test.ts on 2026-09-05, the first time a second module
     * put an act here. (Naming that dictionary in this comment re-attached it
     * to the chain, because the guard scans file text: it is looking for which
     * dictionaries a file MENTIONS, and a comment mentions.) Omitted only
     * where the act cannot fail (a local fill), and then a refusal falls back
     * to a generic sentence rather than to another module's words. */
    readonly errors?: Record<string, string>;
  };
  /** Where a person goes to decide it themselves. */
  readonly link?: { readonly label: string; readonly href: string };
  /** Ways of looking, never of acting. */
  readonly more?: readonly { readonly id: string; readonly label: string; readonly href: string }[];
  /** Trailing note - a source, a timestamp. */
  readonly trail?: string;
  /** Whether 忽略 is offered. A record of what happened (a note you wrote) is
   * not a suggestion and cannot be dismissed. */
  readonly ignorable?: boolean;
}

/** A block of items under one heading - one page-level question answered. */
export interface AssistantSection {
  readonly id: string;
  readonly title: string;
  /** What this block covers, right-aligned: "全部在售价目", "已选行". */
  readonly scope?: string;
  readonly items: readonly AssistantItem[];
  /** Said when there is nothing - health is a result, not an empty state. */
  readonly empty: string;
  /** A control that belongs to the block rather than to any item. */
  readonly footer?: ReactNode;
}

const TONE_TEXT = {
  info: "text-foreground",
  warn: "text-(color:--warning-text)",
  danger: "text-destructive-text",
} as const;

export function AssistantSection({ section, compact = false, onResolve }: { readonly section: AssistantSection; readonly compact?: boolean; readonly onResolve?: (id: string) => void }) {
  const { ASSISTANT_TEXT, ASSISTANT_PANEL_TEXT: P } = useMessages();
  const [confirming, setConfirming] = useState<AssistantItem | null>(null);
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  // ACCEPTED AND IGNORED ARE DIFFERENT THINGS, and conflating them was a
  // real defect (review, 2026-09-05): a successful act pushed the item onto
  // `ignored`, so the product told you it had IGNORED the suggestion you had
  // just accepted. Both lists resolve an item off the screen; only one of
  // them is a dismissal, and only that one is counted.
  const [ignored, setIgnored] = useState<readonly string[]>([]);
  const [accepted, setAccepted] = useState<readonly string[]>([]);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const shown = section.items.filter(
    (i) => !ignored.includes(i.id) && !accepted.includes(i.id),
  );

  const runItem = async (item: AssistantItem): Promise<boolean> => {
    try {
      const result = await item.act!.run();
      if (result.ok) {
        setAccepted(current => [...current, item.id]);
        onResolve?.(item.id);
        if (item.act?.done) toast({ tone: "success", title: item.act.done });
        return true;
      }
      const dictionary = item.act?.errors;
      toast({ tone: "danger", title: dictionary?.[result.error ?? "denied"] ?? dictionary?.denied ?? ASSISTANT_TEXT.actFailed });
    } catch { toast({ tone: "danger", title: ASSISTANT_TEXT.actFailed }); }
    return false;
  };
  const act = (item: AssistantItem) => {
    if (!item.act || pending) return;
    if (item.act.confirm) { setConfirming(item); return; }
    start(async () => { await runItem(item); });
  };

  const Frame = compact ? "div" : Card;
  return (
    <Frame className={compact ? "min-w-0" : "p-sm"}>
      {/* ONE child (polish, 2026-09-24): the DS Card spaces its direct
          children with its own gap, and title / body / footer each already
          carry mt-sm - together a ~50px blank band under every title. */}
      <div>
      {confirming?.act?.confirm ? <ConfirmDestructive open onOpenChange={open => { if (!open) setConfirming(null); }}
        {...confirming.act.confirm} onConfirm={async () => {
          if (!await runItem(confirming)) throw new Error("Action refused");
          setConfirming(null);
        }} /> : null}
      <div className="flex items-center gap-xs">
        <span className="text-label text-foreground">{section.title}</span>
        {section.scope ? (
          <span className="text-muted-foreground ml-auto text-body-small">{section.scope}</span>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground mt-sm text-body-small">{section.empty}</p>
      ) : (
        <div className="mt-sm flex flex-col gap-sm">
          {shown.map((item) => (
            <Card key={item.id} className="p-sm">
              <div>
              <Collapsible open={!compact || expanded.includes(item.id)} onOpenChange={open => setExpanded(current => open ? [...current, item.id] : current.filter(id => id !== item.id))}>
                {compact ? <CollapsibleTrigger className="flex min-h-control-xl w-full items-start justify-between gap-sm text-left" aria-label={`${P.showDetails}: ${item.text}`}>
                  <span className={`text-body-small ${TONE_TEXT[item.tone ?? "info"]}`}>{item.text}</span>
                  <Icon name={expanded.includes(item.id) ? "chevron-up" : "chevron-down"} size="xs" className="mt-2xs shrink-0 text-muted-foreground" />
                </CollapsibleTrigger> : <p className={`text-body-small ${TONE_TEXT[item.tone ?? "info"]}`}>{item.text}</p>}
              <CollapsibleContent>
              {item.evidence ? (
                <p className="text-muted-foreground mt-xs text-body-small">{item.evidence}</p>
              ) : null}
              {item.trail ? (
                <p className="text-muted-foreground mt-xs text-body-small">{item.trail}</p>
              ) : null}

              {item.act || item.link || item.ignorable || item.more?.length ? (
                <div className="mt-sm flex flex-wrap items-center gap-xs">
                  {item.act ? (
                    <Button size="md" disabled={pending} onClick={() => act(item)}>
                      {item.act.label}
                    </Button>
                  ) : null}
                  {item.link ? (
                    <Button asChild size="md" variant={item.act ? "secondary" : "default"}>
                      <a href={item.link.href}>{item.link.label}</a>
                    </Button>
                  ) : null}
                  {item.ignorable !== false ? (
                    <Button
                      size="md"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => { setIgnored(current => [...current, item.id]); onResolve?.(item.id); }}
                    >
                      {ASSISTANT_TEXT.ignore}
                    </Button>
                  ) : null}
                  {item.more && item.more.length > 0 ? (
                    <span className="ml-auto">
                      <ActionMenu
                        items={item.more.map((m) => ({
                          id: m.id,
                          label: m.label,
                          onSelect: () => {
                            window.location.href = m.href;
                          },
                        }))}
                      />
                    </span>
                  ) : null}
                </div>
              ) : null}
              </CollapsibleContent>
              </Collapsible>
              </div>
            </Card>
          ))}
        </div>
      )}

      {section.footer || ignored.length > 0 ? (
        <div className="mt-sm flex items-center gap-xs">
          {section.footer}
          {ignored.length > 0 ? (
            <Tag>{ASSISTANT_TEXT.ignored(ignored.length)}</Tag>
          ) : null}
        </div>
      ) : null}
      </div>
    </Frame>
  );
}

/**
 * The dock's whole body: the assistant itself, then what it has to say about
 * THIS page.
 *
 * Every page's dock is this - the capture card never moves, and the sections
 * below it are the page's own business. That is the "one assistant, different
 * subjects" the owner asked for: a reader learns the shape once.
 */
export function AssistantDeck({
  capture,
  sections,
}: {
  readonly capture: ReactNode;
  readonly sections: readonly AssistantSection[];
}) {
  const interaction = useAssistantInteraction();
  const { ASSISTANT_PANEL_TEXT: T } = useMessages();
  const [localOpen, setLocalOpen] = useState(true);
  const [resolved, setResolved] = useState<readonly string[]>([]);
  const open = interaction?.recommendationsOpen ?? localOpen;
  const active = sections.map(section => ({ ...section, items: section.items.filter(item => !resolved.includes(item.id)) })).filter(section => section.items.length > 0 || section.footer);
  const count = active.reduce((total, section) => total + Math.max(section.items.length, section.footer ? 1 : 0), 0);
  return <div className="flex h-full min-h-0 flex-col gap-md overflow-hidden">
    {count ? <Collapsible open={open} onOpenChange={interaction?.setRecommendationsOpen ?? setLocalOpen} className="max-h-[40%] min-h-0 shrink overflow-y-auto" data-assistant-recommendations>
      <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="md" className="w-full justify-between">
        <span>{T.recommendations}<span className="ml-xs text-muted-foreground">({count})</span></span><Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
      </Button></CollapsibleTrigger>
      <CollapsibleContent className="mt-sm flex flex-col gap-md">
        {active.map(section => <AssistantSection key={section.id} section={section} compact onResolve={id => setResolved(current => [...current, id])} />)}
      </CollapsibleContent>
    </Collapsible> : null}
    <div className="flex min-h-0 flex-1 flex-col" data-assistant-conversation>{capture}</div>
  </div>;
}
