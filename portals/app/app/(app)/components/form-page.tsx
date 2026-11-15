"use client";

import { useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Banner, Button, DestructiveButton, FieldGroup, type DestructiveConfirm } from "@vxture/design-ui";
import { AssistantSection } from "./assistant";
import { useFormAssistSlot } from "./form-assist-slot";
import { useMessages } from "../lib/i18n/provider";

// DS form roles are bound centrally with the existing business-control rules.
// Dedicated pages and grids opt in; toolbar/filter typography stays compact.
export const FORM_ENTRY_CLASS = "text-foreground";

// The shape every DEDICATED FORM PAGE shares - owner ruling, 2026-09-05.
//
// The ruling that created this file: content-rich operations (creating,
// editing) get a PAGE of their own, because a page can afford a long layout and
// an assistant beside it; flow operations (delete, change status) get a dialog.
// Before it, eight list pages carried their create forms inline, and the form
// was always the cramped afterthought under the table.
//
// ONE COLUMN, THE ASSISTANT IN 栏3 (owner 2026-09-28: 智能填写挤在中栏). The
// form takes the centre pane's whole width; the assist (智能填写) renders in
// the deck under 记一笔, through the shell's slot (form-assist-slot.tsx) -
// a portal, so its suggestions still read and fill this form. With the deck
// shut there is no slot, and the assist drops BELOW the form: the form is the
// errand. It used to be a second 20rem column inside the centre pane, which
// squeezed the form and put the product's intelligence in two places.
export function FormPage({
  form,
  assist,
}: {
  readonly form: ReactNode;
  readonly assist?: ReactNode;
}) {
  const slot = useFormAssistSlot();
  return (
    <div className="flex min-w-0 flex-col gap-lg">
      <div className={`min-w-0 ${FORM_ENTRY_CLASS}`} data-business-form>{form}</div>
      {assist ? (slot ? createPortal(assist, slot) : assist) : null}
    </div>
  );
}

/** Short business fields share a responsive three-column DS grid. */
export function FormFields({ children, gap = "xl" }: {
  readonly children: ReactNode;
  readonly gap?: "xl" | "128";
}) {
  return <div className={`@container ${FORM_ENTRY_CLASS}`} data-business-fields>
    <FieldGroup columns={3} className={`grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 ${gap === "128" ? "gap-y-md gap-x-[128px]" : "gap-x-lg gap-y-lg"} *:min-w-0`}>
      {children}
    </FieldGroup>
  </div>;
}

/** Descriptions and long-content controls occupy the available row. */
export function FormFieldWide({ children }: { readonly children: ReactNode }) {
  return <div className="col-span-full min-w-0">{children}</div>;
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

export function NewEntryLink({ href, label, primary = false }: { readonly href: string; readonly label?: string; readonly primary?: boolean }) {
  const { ASSIST_TEXT } = useMessages();
  return (
    <Button asChild size="xl" variant={primary ? "default" : "secondary"}>
      <a href={href}>{label ?? ASSIST_TEXT.newEntry}</a>
    </Button>
  );
}

/**
 * THE BOTTOM OF EVERY DEDICATED FORM PAGE, one shape (owner, 2026-09-12:
 * admin 标题体系与布局统一规范 - 解决按钮位置忽左忽右).
 *
 * Four forms had grown four button rows - org-unit-form.tsx's (right-
 * justified, 放弃 immediately left of 保存, a destructive action pinned to
 * the far left via `mr-auto`) and three left-aligned ones (division-form,
 * member-form, role-form: 保存 FIRST/leftmost, then 放弃, with the
 * destructive action inline in the same flow rather than separated).
 *
 * RIGHT-JUSTIFIED, SAVE LAST, WON on the DS's OWN word, not a coin flip:
 * `DialogForm`'s doc comment states the contract plainly - "取消在左、
 * 提交在右" (cancel on the left, submit on the right). Within the 放弃/
 * 保存 pair that is exactly org-unit-form.tsx's order; the other three
 * forms had it backwards. A destructive action is neither "cancel" nor
 * "submit" - it stays visually separated via `mr-auto` rather than joining
 * either end of that pair.
 */
export function FormActions({
  saveLabel,
  discardLabel,
  onSave,
  onDiscard,
  pending,
  destructive,
  error,
  errorTitle,
}: {
  readonly saveLabel: ReactNode;
  readonly discardLabel: ReactNode;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly pending: boolean;
  /** Offered only when the record may currently be removed - the caller
   *  decides that, this component only places the button. */
  readonly destructive?: {
    readonly label: ReactNode;
    readonly confirm: DestructiveConfirm;
    readonly disabled?: boolean;
  };
  readonly error?: string | null;
  readonly errorTitle?: ReactNode;
}) {
  return (
    <div className="border-border flex flex-col gap-md border-t pt-md">
      <div className="gap-sm flex items-center justify-end">
        {destructive ? (
          <DestructiveButton size="xl" className="mr-auto" disabled={pending || destructive.disabled} confirm={destructive.confirm}>
            {destructive.label}
          </DestructiveButton>
        ) : null}
        <Button size="xl" variant="secondary" disabled={pending} onClick={onDiscard}>
          {discardLabel}
        </Button>
        <Button size="xl" onClick={onSave} disabled={pending}>
          {saveLabel}
        </Button>
      </div>
      {error ? <Banner tone="danger" title={errorTitle} description={error} /> : null}
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
