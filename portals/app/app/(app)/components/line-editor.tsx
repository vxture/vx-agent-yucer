"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Icon,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
  Textarea,
} from "@vxture/design-ui";
import { RowActions } from "./table-fittings";
import { formatMoney } from "../lib/view-model";
import { ConcessionSheet, type ConcessionView } from "./concession-sheet";
import { useMessages } from "../lib/i18n/provider";

// The deal's product lines.
//
// ADR-014 section 2 is what this control is for: when lines exist, THE LINES
// ARE AUTHORITATIVE and the deal's amount is their sum. The recomputation
// happens server-side in the same call that writes them, so this editor never
// sends an amount - it sends what was sold, and the header follows.
//
// REPLACE, NOT PATCH. The whole list goes every time. A patch would leave a
// removed product silently in the quote, and "the total does not match the
// detail" is the hardest kind of bad accounting to find in a system like this.
//
// `needsApproval` is not an input here and there is no control for it. It is
// computed from the price book's floor server-side; a flag the client can set
// is a flag the client can clear, and this one is what sends a discount to a
// human.
//
// APPROVING IS NOT EDITING, and the two controls are gated separately. Signing
// off a below-floor price is `pipeline.discount`, which sales_ops holds and
// sales_rep does not; editing lines is `pipeline.write`, which is the other way
// round. So the approve control sits in the READ view of the table, not inside
// the editor below it - an approver who cannot edit still has to be able to
// reach it, and a rep who can edit must not be able to sign off their own
// discount.

export interface EditorLine {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly needsApproval: boolean;
  /** Whether the signature `needsApproval` demands has been given (ADR-019). */
  readonly approved: boolean;
  /** 本单定制说明 (incr/0082), edited here; shown in 栏1 产品方案, not in the price table. */
  readonly customNote?: string | null;
}

export interface LineEditorProps {
  /** The panel's action, rendered in the Section header beside the
   *  below-floor warning. The read view passes the way in to the editor. */
  readonly action?: ReactNode;
  /** Set when the editor is a PAGE: on a successful save it returns there.
   *  Absent = inline legacy mode (kept for the read view on the deal page). */
  readonly doneHref?: string;
  /** Inside a host that already titles it (a panel or drawer on the deal
   *  page, deal batch 2): the body without its own heading. */
  readonly hideTitle?: boolean;
  /** The deal's currency, for the read view's money cells. */
  readonly currency?: string;
  readonly opportunityId: string;
  readonly lines: readonly EditorLine[];
  readonly products: readonly {
    readonly id: string;
    readonly name: string;
    readonly unit: string;
  }[];
  readonly canEdit: boolean;
  readonly canApprove: boolean;
  /** 让价对照 (deal batch 10a): shown in the signing dialog beside the reason. */
  readonly concession?: ConcessionView;
  /** 价格参谋 (deal batch 10b): absent when the member may not run it. */
  readonly onAdvisePrice?: (opportunityId: string) => ReturnType<NonNullable<Parameters<typeof ConcessionSheet>[0]["onAdvise"]>>;
  readonly closed: boolean;
  readonly onApprove: (
    opportunityId: string,
    productId: string,
    reason: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onSave: (
    opportunityId: string,
    lines: readonly {
      productId: string;
      quantity: number;
      unitPrice: number;
      customNote: string;
    }[],
  ) => Promise<{
    ok: boolean;
    lines?: number;
    amount?: number;
    error?: string;
  }>;
}

interface Draft {
  productId: string;
  quantity: string;
  unitPrice: string;
  customNote: string;
}


export function LineEditor({
  action,
  opportunityId,
  lines,
  products,
  canEdit,
  canApprove,
  concession,
  onAdvisePrice,
  closed,
  onSave,
  onApprove,
  doneHref,
  hideTitle = false,
  currency = "CNY",
}: LineEditorProps) {
  const router = useRouter();
  const { DATA_TABLE_LABELS, DS_LABELS, OPPORTUNITY_ERROR, OPPORTUNITY_TEXT } =
    useMessages();
  const [drafts, setDrafts] = useState<Draft[]>(
    lines.map((l) => ({
      productId: l.productId,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      customNote: l.customNote ?? "",
    })),
  );
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The line being signed off, or null when the dialog is closed. Holding the
  // product id rather than a boolean keeps "which one" and "is it open" as one
  // fact - two would let them disagree.
  const [signing, setSigning] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const name = new Map(products.map((p) => [p.id, p.name]));
  const parsed = drafts.map((d) => ({
    productId: d.productId,
    quantity: Number(d.quantity),
    unitPrice: Number(d.unitPrice),
    // Sent every time, "" included: this editor restates the note, so an
    // emptied field clears it (the service keeps a note only when unstated).
    customNote: d.customNote,
  }));
  const total = parsed.reduce(
    (n, l) =>
      n +
      (Number.isFinite(l.quantity * l.unitPrice)
        ? l.quantity * l.unitPrice
        : 0),
    0,
  );
  const valid = parsed.every(
    (l) =>
      l.productId !== "" &&
      Number.isFinite(l.quantity) &&
      l.quantity > 0 &&
      Number.isFinite(l.unitPrice) &&
      l.unitPrice >= 0,
  );

  return (
    <Section
      id="lines"
      icon={hideTitle ? undefined : "stack"}
      title={hideTitle ? undefined : OPPORTUNITY_TEXT.linesTitle}
      // Not on the editor PAGE either (doneHref): its ViewHeader already says
      // it, and the same paragraph twice made the reader compare them.
      description={hideTitle || doneHref ? undefined : OPPORTUNITY_TEXT.linesWhy}
      /* THE SECTION'S OWN ACTION SLOT holds both the warning and the way in
         to the editor. The page used to put that link in a row of its own
         below the table; the DS puts a panel's action in its header, and one
         placement for every table is the point (owner, 2026-09-08). */
      action={
        <span className="gap-sm flex items-center">
          {lines.some((l) => l.needsApproval && !l.approved) ? (
            <StatusBadge tone="warning">
              {OPPORTUNITY_TEXT.lineBelowFloor}
            </StatusBadge>
          ) : null}
          {action}
        </span>
      }
    >
      {lines.length === 0 && drafts.length === 0 ? (
        <EmptyState
          title={OPPORTUNITY_TEXT.lineNone}
          description={OPPORTUNITY_TEXT.lineNoneWhy}
        />
      ) : (
        // THE DEAL PAGE'S READ VIEW (交易清单 · 报价与审批). The DS table with
        // its fittings (owner 2026-09-26: 列没有首列，文字与标识线重叠；右侧
        // 没有操作 icon；待签标识放在价格，操作放在操作区):
        //   - 序号 first, so the product name no longer sits on a painted
        //     warning edge - the edge is gone, the mark is on the price;
        //   - the price carries 待批 / 已批准, since the price is what broke
        //     the floor;
        //   - 批准 lives in the pinned ⋮ menu. A line with nothing to sign, or
        //     a reader who may not sign, gets the disabled trigger (the
        //     action column never vanishes - table-fittings.tsx).
        // A quote is read, not sorted: no sort arrows.
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          rowKey={(r: EditorLine, i: number) => `${r.productId}-${i}`}
          rows={[...lines]}
          columns={[
            {
              id: "product",
              header: OPPORTUNITY_TEXT.lineProduct,
              cell: (r: EditorLine) => <TableTitleCell title={name.get(r.productId) ?? r.productId} tooltip={name.get(r.productId) ?? r.productId} />,
            },
            { id: "qty", header: OPPORTUNITY_TEXT.lineQty, align: "numeric" as const, cell: (r: EditorLine) => r.quantity },
            {
              id: "price",
              header: OPPORTUNITY_TEXT.linePrice,
              align: "money" as const,
              cell: (r: EditorLine) => (
                <span className="inline-flex items-center justify-end gap-xs">
                  {!r.needsApproval ? null : r.approved ? (
                    <StatusBadge size="sm" tone="success">{OPPORTUNITY_TEXT.lineApproved}</StatusBadge>
                  ) : (
                    <StatusBadge size="sm" tone="warning">{OPPORTUNITY_TEXT.lineAwaiting}</StatusBadge>
                  )}
                  <span className={r.needsApproval && !r.approved ? "text-(color:--warning-text)" : undefined}>
                    {formatMoney(r.unitPrice, currency)}
                  </span>
                </span>
              ),
            },
            { id: "amount", header: OPPORTUNITY_TEXT.lineAmount, align: "money" as const, cell: (r: EditorLine) => formatMoney(r.amount, currency) },
          ]}
          rowActions={(r: EditorLine) => (
            <RowActions
              label={DS_LABELS.actionMenu}
              items={
                r.needsApproval && !r.approved && canApprove && !closed
                  ? [
                      {
                        id: "approve",
                        label: OPPORTUNITY_TEXT.lineApprove,
                        icon: "check",
                        onSelect: () => {
                          setSigning(r.productId);
                          setReason("");
                          setErr(null);
                        },
                      },
                    ]
                  : []
              }
            />
          )}
        />
      )}

      {/* Hosted read view (the deal page's 报价与审批): the way in is the
          panel's own "⋮" 编辑, greyed with its reason there - this line read
          "no permission" to every member, including those who have it. */}
      {!canEdit && hideTitle ? null : !canEdit ? (
        <p className="text-muted-foreground mt-sm text-body-sm">
          {OPPORTUNITY_TEXT.lineDenied}
        </p>
      ) : closed ? (
        // Absent, not disabled. The rule refuses every patch on a closed deal,
        // and a greyed editor invites a fight nobody can win.
        <p className="text-muted-foreground mt-sm text-body-sm">
          {OPPORTUNITY_TEXT.lineClosedHint}
        </p>
      ) : (
        <div className="mt-md flex flex-col gap-sm">
          {drafts.map((d, i) => (
            <div key={i} className="flex flex-wrap items-end gap-xs">
              <NativeSelect
                value={d.productId}
                onChange={(e) =>
                  setDrafts((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, productId: e.target.value } : x,
                    ),
                  )
                }
              >
                <option value="">{OPPORTUNITY_TEXT.lineProduct}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
              <Input
                type="number"
                min="1"
                className="w-24"
                /* Labelled (module rebuild, 2026-09-27): these two read as a
                   bare "1" and "520000" with nothing saying which is which. */
                aria-label={OPPORTUNITY_TEXT.lineQty}
                placeholder={OPPORTUNITY_TEXT.lineQty}
                value={d.quantity}
                onChange={(e) =>
                  setDrafts((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, quantity: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                type="number"
                min="0"
                className="w-32"
                aria-label={OPPORTUNITY_TEXT.linePrice}
                placeholder={OPPORTUNITY_TEXT.linePrice}
                value={d.unitPrice}
                onChange={(e) =>
                  setDrafts((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, unitPrice: e.target.value } : x,
                    ),
                  )
                }
              />
              {/* The line's own subtotal, as it will be saved. */}
              <span className="text-muted-foreground w-28 text-right text-body-sm tabular-nums" aria-live="polite">
                {Number.isFinite(Number(d.quantity) * Number(d.unitPrice))
                  ? formatMoney(Number(d.quantity) * Number(d.unitPrice), currency)
                  : "-"}
              </span>
              <Input
                className="min-w-48 flex-1"
                maxLength={255}
                value={d.customNote}
                aria-label={OPPORTUNITY_TEXT.lineNote}
                placeholder={OPPORTUNITY_TEXT.lineNotePlaceholder}
                onChange={(e) =>
                  setDrafts((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, customNote: e.target.value } : x,
                    ),
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={OPPORTUNITY_TEXT.lineRemove}
                onClick={() =>
                  setDrafts((prev) => prev.filter((_, j) => j !== i))
                }
              >
                <Icon name="x" size="xs" />
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-xs">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDrafts((prev) => [
                  ...prev,
                  { productId: "", quantity: "1", unitPrice: "0", customNote: "" },
                ])
              }
            >
              {OPPORTUNITY_TEXT.lineAdd}
            </Button>
            <Button
              disabled={!valid || pending}
              onClick={() =>
                start(() => {
                  void onSave(opportunityId, parsed).then((r) => {
                    setErr(
                      r.ok
                        ? null
                        : (OPPORTUNITY_ERROR[r.error ?? "denied"] ??
                            r.error ??
                            ""),
                    );
                    if (r.ok && doneHref) {
                      // An editor page is an errand: the rows land, the deal
                      // page shows them.
                      router.push(doneHref);
                      router.refresh();
                      return;
                    }
                    setSaved(
                      r.ok
                        ? OPPORTUNITY_TEXT.lineSaved(
                            r.lines ?? 0,
                            (r.amount ?? 0).toLocaleString(),
                          )
                        : null,
                    );
                  });
                })
              }
            >
              {OPPORTUNITY_TEXT.lineSave}
            </Button>
            {/* The running total, shown while they type. It is what the header
                will BECOME - so the reader sees the consequence before they
                commit to it rather than discovering it afterwards. */}
            <span className="text-muted-foreground text-body-sm tabular-nums">
              {OPPORTUNITY_TEXT.lineAmount} {formatMoney(total, currency)}
            </span>
            {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
            {saved && !err ? (
              <StatusBadge tone="success">{saved}</StatusBadge>
            ) : null}
          </div>
        </div>
      )}

      {/* The signature. A reason is REQUIRED, not optional: the rule refuses a
          blank one, because the value of this record is not that somebody
          clicked but why the floor was worth breaking. The floor and the price
          are not fields here - the server reads both off the line that is
          actually on the deal, so an approver signs what is there rather than
          a number they typed. */}
      <Dialog
        open={signing !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setSigning(null);
        }}
      >
        <DialogContent width={concession ? "md" : "sm"}>
          <DialogHeader>
            <DialogTitle>{OPPORTUNITY_TEXT.lineApproveTitle}</DialogTitle>
            <DialogDescription>
              {OPPORTUNITY_TEXT.lineApproveWhy(
                (signing ? name.get(signing) : null) ?? signing ?? "",
              )}
            </DialogDescription>
          </DialogHeader>
          {concession ? (
            <ConcessionSheet
              view={concession}
              names={name}
              currency={currency}
              highlight={signing}
              onAdvise={onAdvisePrice ? () => onAdvisePrice(opportunityId) : undefined}
            />
          ) : null}
          <Textarea
            value={reason}
            aria-label={OPPORTUNITY_TEXT.lineApproveReason}
            placeholder={OPPORTUNITY_TEXT.lineApproveReason}
            onChange={(e) => setReason(e.target.value)}
          />
          {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSigning(null)}>
              {OPPORTUNITY_TEXT.lineApproveCancel}
            </Button>
            <Button
              disabled={!reason.trim() || pending}
              onClick={() => {
                const productId = signing;
                if (!productId) return;
                start(() => {
                  void onApprove(opportunityId, productId, reason).then((r) => {
                    if (r.ok) {
                      setSigning(null);
                      setErr(null);
                    } else {
                      setErr(
                        OPPORTUNITY_ERROR[r.error ?? "denied"] ??
                          r.error ??
                          "",
                      );
                    }
                  });
                });
              }}
            >
              {OPPORTUNITY_TEXT.lineApprove}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
