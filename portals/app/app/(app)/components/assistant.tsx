"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ActionMenu, Button, Card, StatusBadge, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

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
  danger: "text-(color:--danger-text)",
} as const;

export function AssistantSection({ section }: { readonly section: AssistantSection }) {
  const { ASSISTANT_TEXT, CATALOG_ERROR } = useMessages();
  const [ignored, setIgnored] = useState<readonly string[]>([]);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const shown = section.items.filter((i) => !ignored.includes(i.id));

  const act = (item: AssistantItem) => {
    if (!item.act) return;
    start(() => {
      void item.act!.run().then((r) => {
        if (r.ok) {
          setIgnored((x) => [...x, item.id]);
          if (item.act?.done) toast({ tone: "success", title: item.act.done });
        } else {
          toast({
            tone: "danger",
            title: CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied,
          });
        }
      });
    });
  };

  return (
    <Card className="p-sm">
      <div className="flex items-center gap-xs">
        <span className="text-label-md text-foreground">{section.title}</span>
        {section.scope ? (
          <span className="text-muted-foreground ml-auto text-body-sm">{section.scope}</span>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground mt-sm text-body-sm">{section.empty}</p>
      ) : (
        <div className="mt-sm flex flex-col gap-sm">
          {shown.map((item) => (
            <div key={item.id} className="border-border rounded-md border p-sm">
              <p className={`text-body-sm ${TONE_TEXT[item.tone ?? "info"]}`}>{item.text}</p>
              {item.evidence ? (
                <p className="text-muted-foreground mt-xs text-body-sm">{item.evidence}</p>
              ) : null}
              {item.trail ? (
                <p className="text-muted-foreground mt-xs text-body-sm">{item.trail}</p>
              ) : null}

              {item.act || item.link || item.ignorable || item.more?.length ? (
                <div className="mt-sm flex flex-wrap items-center gap-xs">
                  {item.act ? (
                    <Button size="sm" disabled={pending} onClick={() => act(item)}>
                      {item.act.label}
                    </Button>
                  ) : null}
                  {item.link ? (
                    <Button asChild size="sm" variant={item.act ? "secondary" : "default"}>
                      <a href={item.link.href}>{item.link.label}</a>
                    </Button>
                  ) : null}
                  {item.ignorable !== false ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setIgnored((x) => [...x, item.id])}
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
            </div>
          ))}
        </div>
      )}

      {section.footer || ignored.length > 0 ? (
        <div className="mt-sm flex items-center gap-xs">
          {section.footer}
          {ignored.length > 0 ? (
            <StatusBadge tone="neutral">{ASSISTANT_TEXT.ignored(ignored.length)}</StatusBadge>
          ) : null}
        </div>
      ) : null}
    </Card>
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
  return (
    <div className="flex flex-col gap-sm">
      {capture}
      {sections.map((s) => (
        <AssistantSection key={s.id} section={s} />
      ))}
    </div>
  );
}
