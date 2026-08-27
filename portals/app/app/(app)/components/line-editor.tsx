"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Icon,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
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

export interface EditorLine {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly needsApproval: boolean;
}

export interface LineEditorProps {
  readonly opportunityId: string;
  readonly lines: readonly EditorLine[];
  readonly products: readonly {
    readonly id: string;
    readonly name: string;
    readonly unit: string;
  }[];
  readonly canEdit: boolean;
  readonly closed: boolean;
  readonly onSave: (
    opportunityId: string,
    lines: readonly {
      productId: string;
      quantity: number;
      unitPrice: number;
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
}

export function LineEditor({
  opportunityId,
  lines,
  products,
  canEdit,
  closed,
  onSave,
}: LineEditorProps) {
  const { DATA_TABLE_LABELS, OPPORTUNITY_ERROR, OPPORTUNITY_TEXT } =
    useMessages();
  const [drafts, setDrafts] = useState<Draft[]>(
    lines.map((l) => ({
      productId: l.productId,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
    })),
  );
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const name = new Map(products.map((p) => [p.id, p.name]));
  const parsed = drafts.map((d) => ({
    productId: d.productId,
    quantity: Number(d.quantity),
    unitPrice: Number(d.unitPrice),
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
      icon="stack"
      title={OPPORTUNITY_TEXT.linesTitle}
      description={OPPORTUNITY_TEXT.linesWhy}
      action={
        lines.some((l) => l.needsApproval) ? (
          <StatusBadge tone="warning">
            {OPPORTUNITY_TEXT.lineBelowFloor}
          </StatusBadge>
        ) : undefined
      }
    >
      {lines.length === 0 && drafts.length === 0 ? (
        <EmptyState
          title={OPPORTUNITY_TEXT.lineNone}
          description={OPPORTUNITY_TEXT.lineNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(_r: EditorLine, i: number) => `${_r.productId}-${i}`}
          rows={[...lines]}
          columns={[
            {
              id: "product",
              header: OPPORTUNITY_TEXT.lineProduct,
              cell: (r: EditorLine) => name.get(r.productId) ?? r.productId,
            },
            {
              id: "qty",
              header: OPPORTUNITY_TEXT.lineQty,
              align: "right" as const,
              cell: (r: EditorLine) => r.quantity,
            },
            {
              id: "price",
              header: OPPORTUNITY_TEXT.linePrice,
              align: "right" as const,
              // A below-floor price is marked ON THE PRICE, not in a separate
              // column: the reader is looking at the number that caused it.
              cell: (r: EditorLine) => (
                <span
                  className={
                    r.needsApproval ? "text-(color:--warning-text)" : undefined
                  }
                >
                  {r.unitPrice.toLocaleString()}
                </span>
              ),
            },
            {
              id: "amount",
              header: OPPORTUNITY_TEXT.lineAmount,
              align: "right" as const,
              cell: (r: EditorLine) => r.amount.toLocaleString(),
            },
          ]}
        />
      )}

      {!canEdit ? (
        <p className="text-muted-foreground mt-sm text-xs">
          {OPPORTUNITY_TEXT.lineDenied}
        </p>
      ) : closed ? (
        // Absent, not disabled. The rule refuses every patch on a closed deal,
        // and a greyed editor invites a fight nobody can win.
        <p className="text-muted-foreground mt-sm text-xs">
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
                value={d.unitPrice}
                onChange={(e) =>
                  setDrafts((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, unitPrice: e.target.value } : x,
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
                  { productId: "", quantity: "1", unitPrice: "0" },
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
            <span className="text-muted-foreground text-xs tabular-nums">
              {OPPORTUNITY_TEXT.lineAmount} {total.toLocaleString()}
            </span>
            {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
            {saved && !err ? (
              <StatusBadge tone="success">{saved}</StatusBadge>
            ) : null}
          </div>
        </div>
      )}
    </Section>
  );
}
