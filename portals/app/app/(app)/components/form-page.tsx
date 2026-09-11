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
      {/* The 20rem second column is reserved ONLY when there is an aside to
          put in it - a form with no `assist` used to keep the template
          anyway, leaving a permanent 20rem blank strip on the right past
          @3xl (owner, 2026-09-11: 没有留白空间, org-unit-form.tsx has none). */}
      <div className={`grid items-start gap-lg${assist ? " @3xl:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
        <div className="min-w-0">{form}</div>
        {assist ? <div className="min-w-0">{assist}</div> : null}
      </div>
    </div>
  );
}

/**
 * THE FIELD GRID - two items to a row, evenly (owner, 2026-09-09).
 *
 * WHAT IT REPLACES. Forms capped their whole field stack at a reading measure
 * (max-w-(--vx-container-md), 448px) and put two fields inside it, so on a
 * page that had just been given its full width the pair sat squeezed into the
 * left quarter with everything else empty. The owner's words for the two
 * failure modes it is between: 简单粗暴拉伸 - a control stretched across
 * 1400px - and 堆积, everything piled into one narrow column.
 *
 * SO: THE COLUMNS SPLIT EVENLY and the CONTROLS TIGHTEN UNIFORMLY. Two equal
 * 1fr columns take the form's width, and every grid item carries the same
 * max measure, so a wide window spends its extra width on the gutter between
 * two evenly-set columns rather than on making a code field wide enough for
 * eighty characters. Both columns are treated identically, which is what
 * keeps a half-filled column reading as a layout rather than as a squeeze.
 *
 * A CONTAINER QUERY, NOT A VIEWPORT BREAKPOINT - the same argument FormPage
 * makes above it. What decides whether two columns fit is how much room this
 * form actually has, and with a sidebar and (later) an agent panel beside it
 * the viewport does not know that. @xl is 36rem of container: two columns only
 * when each still gets ~17rem.
 */
export function FormFields({
  children,
  gap = "xl",
}: {
  readonly children: ReactNode;
  /** "xl" (32px both axes, the default every other form keeps) or "128" -
   *  a single page's explicit ask for far more HORIZONTAL air between its
   *  two columns (owner, 2026-09-11: 内容区一行两条布局的，gap = 128px).
   *  Only the COLUMN gap widens to 128px - row gap stays the same 32px
   *  every stacked field already used (owner, 2026-09-11, after "128" first
   *  shipped as a uniform `gap-[128px]`: 横向gap=128，纵向gap按原来值 - the
   *  vertical rhythm between rows is not this page's own thing to change).
   *  Not the default, so it stays that page's own choice rather than a
   *  systemic redesign of every two-column form. */
  readonly gap?: "xl" | "128";
}) {
  return (
    <div className="@container">
      {/* gap-xl (32px) rather than the md the stacked forms used: two columns
          need a gutter wide enough to read as a gutter, or the two fields look
          like one wrapped row.

          THE MEASURE IS A VARIABLE, not a class, and that is what lets
          FormFieldWide exist. `*:max-w-(--vx-field-measure)` sets the cap on
          every direct child, and a child selector beats a class the child
          carries itself - so a wide field cannot simply declare max-w-none.
          Redeclaring the VARIABLE on itself works, because the value is
          resolved on the element the declaration lands on. */}
      <div
        className={`${gap === "128" ? "gap-y-[32px] gap-x-[128px]" : "gap-xl"} @xl:grid-cols-2 grid grid-cols-1 [--vx-field-measure:var(--vx-container-lg)] *:min-w-0 *:max-w-(--vx-field-measure)`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A field that takes the whole row inside FormFields.
 *
 * FOR THE ONES THAT ARE NOT HALF A ROW'S WORTH OF QUESTION: the "which record
 * am I editing" selector at the top of an upsert form governs everything under
 * it rather than sitting beside one of them, and a control whose content is a
 * sentence needs the width. Everything else is a field and takes a column.
 *
 * It also drops the measure - a full row that stopped at half of it would be
 * the squeeze this grid exists to end, one row lower.
 */
export function FormFieldWide({ children }: { readonly children: ReactNode }) {
  return <div className="@xl:col-span-2 [--vx-field-measure:none]">{children}</div>;
}

/**
 * WHERE A DISPLAY PAGE PUTS ITS ACTIONS - one row, one spacing, everywhere.
 *
 * It used to be the wrapper inside NewEntryLink, which worked while every page
 * had exactly one doorway and broke the moment /territory had three: that page
 * grew its own flex row with its own gap and its own raw Buttons, and the
 * result was two conventions on one screen. The row is a component now, so a
 * page with three actions and a page with one are laid out by the same code.
 */
/* EntryActions IS GONE (owner, 2026-09-08: 表格有操作行样式规范，找 DS 模版).
 *
 * It was a `div.mt-md.flex` that each page dropped wherever it happened to
 * read well - under the table on /pipeline and /campaign, between two panels
 * on /planning, inside a Section on the same page. Four placements for one
 * kind of control.
 *
 * The DS already answers this and has all along: `ViewHeader`/`Section` take
 * an `action` slot (the header's right side, aligned to the description's
 * baseline - "按钮属于接下来做什么，挂在页头的收束线上"), and a list-level
 * 新建 belongs in `FilterBar.actions` where a page has a filter row. So the
 * button goes into the header of whatever owns the table, and this positioner
 * has nothing left to do.
 */

export function NewEntryLink({ href, label }: { readonly href: string; readonly label?: string }) {
  const { ASSIST_TEXT } = useMessages();
  return (
    <Button asChild variant="secondary">
      <a href={href}>{label ?? ASSIST_TEXT.newEntry}</a>
    </Button>
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
        // `scope` is a short right-aligned label ("已选行", "全部在售价目"),
        // and ASSIST_TEXT.description is two sentences - it collapsed the
        // header in the 20rem aside (review, 2026-09-05). The explanation
        // belongs where there is room for it: the empty state, which is where
        // a reader looks when the panel has nothing to say.
        empty: `${ASSIST_TEXT.nothing}${ASSIST_TEXT.description}`,
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
