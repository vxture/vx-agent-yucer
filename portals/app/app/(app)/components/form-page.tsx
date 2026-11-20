"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banner, Button, DestructiveButton, FieldGroup, Icon, type DestructiveConfirm } from "@vxture/design-ui";
import { PageActionButton } from "./page-header-actions";
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

type NewEntry = { readonly label?: string };

export function NewEntryLink({ href, label, newTab }: NewEntry & { readonly href: string; readonly newTab?: boolean }) {
  const { ASSIST_TEXT } = useMessages();
  return (
    <PageActionButton asChild intent="primary" data-business-create>
      <Link href={href} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined}>
        <Icon name="plus" size="sm" aria-hidden="true" />{label ?? ASSIST_TEXT.newEntry}
      </Link>
    </PageActionButton>
  );
}

export function NewEntryButton({ onClick, disabled, label }: NewEntry & {
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  const { ASSIST_TEXT } = useMessages();
  return (
    <PageActionButton type="button" intent="primary" data-business-create disabled={disabled} onClick={onClick}>
      <Icon name="plus" size="sm" aria-hidden="true" />{label ?? ASSIST_TEXT.newEntry}
    </PageActionButton>
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
  // Lock synchronously: two clicks can arrive before React commits disabled.
  const inFlight = useRef(false);
  return {
    err,
    pending,
    run(fn: () => Promise<{ ok: boolean; error?: string }>, errorOf: (code: string) => string) {
      if (inFlight.current) return;
      inFlight.current = true;
      setErr(null);
      start(async () => {
        try {
          const r = await fn();
          if (r.ok) {
            router.push(onDone);
            router.refresh();
          } else {
            setErr(errorOf(r.error ?? "denied"));
          }
        } catch {
          setErr(errorOf("save_failed"));
        } finally {
          inFlight.current = false;
        }
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
