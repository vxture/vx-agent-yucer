"use client";

import { useEffect, useState } from "react";
import { Input, NativeSelect, StatusBadge } from "@vxture/design-ui";
import { DialogForm } from "./dialog-form";
import { Tag } from "./tag";
import { useMessages } from "../lib/i18n/provider";
import type { ProductTypeRecord } from "../../domains/catalog/store";

// The product-type dialog (owner, 2026-09-29) - two lines and a preview:
//
//   一级类  [XX] [NAME                ] [code     ]
//   二级类  [XX] [NAME                ] [code     ]
//   预览    【01-02】【软件产品-基础软件】
//
// XX is the two-digit number, narrow; NAME takes the rest of the line. The
// first line may pick an existing 一级类 or define a new one; the second line
// left empty saves the 一级类 alone (single level still valid).
//
// 代码 sits on each line because the English code is required and, since
// incr/0100, editable - it has to be filled somewhere.

export type ProductTypeDialogOpen =
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly typeId: string };

interface Line {
  typeNo: string;
  name: string;
  typeCode: string;
}

const EMPTY: Line = { typeNo: "", name: "", typeCode: "" };
const NEW = "__new__";

export function ProductTypeDialog({
  types,
  open,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  readonly types: readonly ProductTypeRecord[];
  readonly open: ProductTypeDialogOpen | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    level1: Line & { id?: string };
    level2: (Line & { id?: string }) | null;
  }) => void;
}) {
  const { CATALOG_TEXT } = useMessages();
  const tops = types.filter((t) => t.parentId === null).sort((a, b) => a.typeNo.localeCompare(b.typeNo));

  const [choice, setChoice] = useState<string>(NEW);
  const [l1, setL1] = useState<Line>(EMPTY);
  const [l2, setL2] = useState<Line & { id?: string }>(EMPTY);
  /** Editing a 一级类 that is its own row: the first line IS that row, no picker. */
  const [editingTop, setEditingTop] = useState(false);

  const lineOf = (t: ProductTypeRecord): Line => ({ typeNo: t.typeNo, name: t.name, typeCode: t.typeCode });

  useEffect(() => {
    if (!open) return;
    if (open.mode === "create") {
      setChoice(NEW);
      setL1(EMPTY);
      setL2(EMPTY);
      setEditingTop(false);
      return;
    }
    const t = types.find((x) => x.id === open.typeId);
    const parent = t?.parentId ? types.find((x) => x.id === t.parentId) : undefined;
    if (t && parent) {
      setChoice(parent.id);
      setL1(lineOf(parent));
      setL2({ ...lineOf(t), id: t.id });
      setEditingTop(false);
    } else if (t) {
      setChoice(t.id);
      setL1(lineOf(t));
      setL2(EMPTY);
      setEditingTop(true);
    }
    // types is the page's own list; re-seed only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Picking an existing 一级类 while ADDING fills and locks the line; while
  // EDITING, the line edits that 一级类 (its number, name and code).
  const locked = open?.mode === "create" && choice !== NEW;

  const pick = (id: string) => {
    setChoice(id);
    const t = types.find((x) => x.id === id);
    setL1(t ? lineOf(t) : EMPTY);
  };

  const hasL2 = l2.typeNo.trim() !== "" || l2.name.trim() !== "" || l2.typeCode.trim() !== "";
  const two = /^[0-9]{2}$/;
  const lineReady = (l: Line) => two.test(l.typeNo.trim()) && l.name.trim() !== "" && l.typeCode.trim() !== "";
  const ready = lineReady(l1) && (!hasL2 || lineReady(l2));

  const previewNo = hasL2 ? `${l1.typeNo || "XX"}-${l2.typeNo || "XX"}` : l1.typeNo || "XX";
  const previewName = hasL2
    ? `${l1.name || CATALOG_TEXT.typeLevel1}-${l2.name || CATALOG_TEXT.typeLevel2}`
    : l1.name || CATALOG_TEXT.typeLevel1;

  const row = (
    label: string,
    line: Line,
    set: (next: Line) => void,
    disabled: boolean,
    idPrefix: string,
    picker?: React.ReactNode,
  ) => (
    <div className="flex items-center gap-sm">
      <span className="text-muted-foreground w-[3.5rem] shrink-0 text-body-sm">{label}</span>
      {picker}
      <Input
        id={`${idPrefix}-no`}
        className="w-[3.5rem] shrink-0 text-center tabular-nums"
        inputMode="numeric"
        maxLength={2}
        placeholder="XX"
        aria-label={`${label} ${CATALOG_TEXT.typeNoLabel}`}
        value={line.typeNo}
        disabled={disabled || pending}
        onChange={(e) => set({ ...line, typeNo: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })}
      />
      <Input
        id={`${idPrefix}-name`}
        className="min-w-0 flex-1"
        placeholder={CATALOG_TEXT.typeNameLabel}
        aria-label={`${label} ${CATALOG_TEXT.typeNameLabel}`}
        value={line.name}
        disabled={disabled || pending}
        onChange={(e) => set({ ...line, name: e.target.value })}
      />
      <Input
        id={`${idPrefix}-code`}
        className="w-[8rem] shrink-0"
        placeholder={CATALOG_TEXT.typeCodeLabel}
        aria-label={`${label} ${CATALOG_TEXT.typeCodeLabel}`}
        value={line.typeCode}
        disabled={disabled || pending}
        onChange={(e) => set({ ...line, typeCode: e.target.value })}
      />
    </div>
  );

  return (
    <DialogForm
      open={open !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      size="lg"
      title={open?.mode === "edit" ? CATALOG_TEXT.typeDialogEdit : CATALOG_TEXT.addType}
      description={CATALOG_TEXT.typeDialogWhy}
      submitLabel={CATALOG_TEXT.saveType}
      submitting={pending}
      submitDisabled={!ready}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        onSubmit({
          level1: { ...l1, id: choice === NEW ? undefined : choice },
          level2: hasL2 ? l2 : null,
        });
      }}
    >
      <div className="flex flex-col gap-sm">
        {row(
          CATALOG_TEXT.typeLevel1,
          l1,
          setL1,
          locked,
          "type-l1",
          editingTop ? undefined : (
            // Wrapped: the DS select takes its wrapper's width, not a class of
            // its own - bare, it filled the line and crushed the name field.
            <div className="w-[9rem] shrink-0">
            <NativeSelect
              aria-label={CATALOG_TEXT.typeLevel1}
              value={choice}
              disabled={pending}
              onChange={(e) => pick(e.target.value)}
            >
              <option value={NEW}>{CATALOG_TEXT.typeNewLevel1}</option>
              {tops.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.typeNo} {t.name}
                </option>
              ))}
            </NativeSelect>
            </div>
          ),
        )}
        {row(
          CATALOG_TEXT.typeLevel2,
          l2,
          (next) => setL2({ ...l2, ...next }),
          false,
          "type-l2",
          editingTop ? undefined : <span className="w-[9rem] shrink-0" aria-hidden />,
        )}
        <p className="text-muted-foreground pl-[4.25rem] text-body-sm">{CATALOG_TEXT.typeLevel2Hint}</p>

        <div className="flex items-center gap-sm border-border border-t pt-sm">
          <span className="text-muted-foreground w-[3.5rem] shrink-0 text-body-sm">{CATALOG_TEXT.typePreview}</span>
          <Tag>{previewNo}</Tag>
          <span className="text-foreground text-body-md">{previewName}</span>
        </div>
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </div>
    </DialogForm>
  );
}
