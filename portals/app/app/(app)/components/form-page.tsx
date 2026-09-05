"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Section } from "@vxture/design-ui";
import { AssistantSection } from "./assistant";
import { useMessages } from "../lib/i18n/provider";

// The shape every DEDICATED FORM PAGE shares - owner ruling, 2026-09-05.
//
// The ruling that created this file: content-rich operations (creating,
// editing) get a PAGE of their own, because a page can afford a long layout and
// an assistant beside it; flow operations (delete, change status) get a dialog.
// Before it, eight list pages carried their create forms inline, and the form
// was always the cramped afterthought under the table.
//
// TWO COLUMNS: the work on the left, the help on the right. The aside is not
// decoration - it is where the product's intelligence surfaces while somebody
// is mid-form, which is exactly when a suggestion is worth something. When the
// space is narrow the aside drops BELOW the form: the form is the errand.
//
// A CONTAINER QUERY, NOT A VIEWPORT BREAKPOINT. This split keyed on `xl:`
// (viewport >= 1280px) and that was the squeeze every form page showed at
// 1440px: with the board and the AI dock both open the CONTENT area is
// ~660px, but the viewport still said xl, so the grid went two-column and
// handed the form ~300px. What varies with the side panels is the container,
// so the container is what the breakpoint has to read. @3xl = 48rem of
// container: two columns only when the form would still get ~28rem for
// itself.
export function FormPage({
  form,
  assist,
}: {
  readonly form: ReactNode;
  readonly assist?: ReactNode;
}) {
  return (
    <div className="@container">
      <div className="grid items-start gap-lg @3xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">{form}</div>
        {assist ? <div className="min-w-0">{assist}</div> : null}
      </div>
    </div>
  );
}

/**
 * The one control a display page keeps: the way in to its creation page.
 * A real <a>, not a router.push - middle-click and open-in-new-tab must work,
 * because a person adding five rows wants five tabs, not five round trips.
 */
export function NewEntryLink({ href, label }: { readonly href: string; readonly label?: string }) {
  const { ASSIST_TEXT } = useMessages();
  return (
    <div className="mt-md">
      <Button asChild variant="secondary">
        <a href={href}>{label ?? ASSIST_TEXT.newEntry}</a>
      </Button>
    </div>
  );
}

/** One thing the assistant noticed, and the one-click way to take it. */
export interface AssistSuggestion {
  readonly id: string;
  /** What it noticed. */
  readonly label: string;
  /** WHY - a suggestion without its evidence is an order. */
  readonly reason: string;
  /** Fills the field. Local to this form, which is the whole reason this
   * surface is in the page rather than in the dock. */
  readonly apply: () => void;
}

/**
 * SMART FILL - the assistant, beside a form.
 *
 * It renders through the same surface the dock does (assistant.tsx), so 忽略
 * and the item layout mean the same thing here as everywhere else. What it
 * cannot do is MOVE to the dock: these suggestions read the form's unsaved
 * state, and the dock is a parallel route in a different React tree. Being
 * honest about that is better than pretending the two are the same instance -
 * the shape is unified, the location follows the data.
 */
export function AssistPanel({ suggestions }: { readonly suggestions: readonly AssistSuggestion[] }) {
  const { ASSIST_TEXT } = useMessages();
  return (
    <AssistantSection
      section={{
        id: "assist",
        title: ASSIST_TEXT.title,
        scope: ASSIST_TEXT.description,
        empty: ASSIST_TEXT.nothing,
        items: suggestions.map((s) => ({
          id: s.id,
          text: s.label,
          evidence: s.reason,
          // A local fill, not a server act - it returns immediately and the
          // surface treats it like any other accepted item.
          act: {
            label: ASSIST_TEXT.apply,
            run: async () => {
              s.apply();
              return { ok: true };
            },
          },
        })),
      }}
    />
  );
}

/**
 * Submit-and-return for a creation page. On success the page goes back to its
 * list - a creation page is an errand, not a place - and on refusal the CODE
 * is translated by the caller's own dictionary, never rendered raw (TD-010).
 */
export function useFormSubmit(onDone: string) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return {
    err,
    pending,
    run(fn: () => Promise<{ ok: boolean; error?: string }>, errorOf: (code: string) => string) {
      start(() => {
        void fn().then((r) => {
          if (r.ok) {
            router.push(onDone);
            router.refresh();
          } else {
            setErr(errorOf(r.error ?? "denied"));
          }
        });
      });
    },
  };
}

/** Split a list field on every comma its languages write. */
export function splitListField(v: string): string[] {
  return v
    .split(/[,\u3001\uFF0C]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
