"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  DialogForm,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Section,
  StatusBadge,
  TableTitleCell,
  useToast,
} from "@vxture/design-ui";
import type { ProductRecord, ProductUnitRecord } from "../../domains/catalog/store";
import { useMessages } from "../lib/i18n/provider";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  RowActions,
  rowClickSelection,
  useTableSort,
} from "./table-fittings";

// 计价单位 - 产品配置's third INDEPENDENT vocabulary (incr/0037), added on the
// owner's instruction of 2026-09-08. Same rule as the other two: this file and
// the type/status configs import nothing from each other.
//
// WHY IT IS CONFIGURED AT ALL. `unit` was a free-text field on the product
// form, and every quote line multiplies quantity by unit price - so 套 typed
// by one person and 台 typed by another are two units nobody can group by, and
// "12 × ¥8,000" means nothing until you know what one of them is.
//
// NO STATE COLUMN, unlike the type. A retired type still describes the
// products that carry it; a unit that stopped being offered is either still
// what those products are priced in, or they need repricing - and neither is
// a state the vocabulary can hold. So the columns are 序号 | 单位名称 |
// 关联产品 | 操作, and deletion is refused while anything is priced in it.

export interface CatalogUnitConfigProps {
  readonly units: readonly ProductUnitRecord[];
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: {
    unitCode: string;
    name: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onMove: (id: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

const SORT_ON = {
  name: (r: ProductUnitRecord) => r.name,
};

export function CatalogUnitConfig({
  units,
  products,
  onSave,
  onMove,
  onDelete,
}: CatalogUnitConfigProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS } = useMessages();
  const sorted = useTableSort<ProductUnitRecord>([], SORT_ON);
  const [dialog, setDialog] = useState<{ mode: "create" | "rename"; code: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const select = rowClickSelection(units, (r) => r.id, selected, setSelected);
  const { toast } = useToast();

  const inUse = (unitId: string) => products.filter((p) => p.unitId === unitId).length;

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({
          tone: "danger",
          title: CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied,
        });
      });
    });

  const submitDialog = () => {
    if (!dialog) return;
    setErr(null);
    startTransition(() => {
      void onSave({ unitCode: dialog.code.trim(), name: dialog.name.trim() }).then((r) => {
        if (r.ok) setDialog(null);
        else setErr(CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied);
      });
    });
  };

  return (
    <Section
      title={CATALOG_TEXT.unitsTitle}
      description={CATALOG_TEXT.unitsWhy}
      action={
        <Button onClick={() => { setErr(null); setDialog({ mode: "create", code: "", name: "" }); }}>
          {CATALOG_TEXT.addUnit}
        </Button>
      }
    >
      {/* The same two constraints from outside the other config tables carry
          (TD-022), so all three line up column for column. */}
      <div
        ref={select.ref}
        className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} ${select.className}`}
      >
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        rowKey={(u: ProductUnitRecord) => u.id}
        rows={[...sorted.sortRows(units)]}
        sort={sorted.sort}
        onSortChange={sorted.onSortChange}
        columns={[
          {
            id: "name",
            sortable: true,
            header: CATALOG_TEXT.colUnitName,
            width: "md" as const,
            /* The code is omitted when it equals the name - a second line
               repeating the first costs height and says nothing. Here it
               rarely does: the code is ASCII (set / month) and the name is
               what a quote prints (套 / 月). */
            cell: (u: ProductUnitRecord) => (
              <TableTitleCell
                title={u.name}
                description={u.unitCode !== u.name ? u.unitCode : undefined}
                tooltip={u.name}
              />
            ),
          },
          {
            id: "linked",
            header: CATALOG_TEXT.colLinkedProducts,
            width: "sm" as const,
            cell: (u: ProductUnitRecord) => (
              <span className="tabular-nums">{CATALOG_TEXT.linkedCount(inUse(u.id))}</span>
            ),
          },
        ]}
        rowActions={(u: ProductUnitRecord, rowIndex: number) => (
          <RowActions
            disabled={pending}
            items={[
              {
                id: "rename",
                label: CATALOG_TEXT.renameUnit,
                onSelect: () => {
                  setErr(null);
                  setDialog({ mode: "rename", code: u.unitCode, name: u.name });
                },
              },
              {
                id: "up",
                label: CATALOG_TEXT.opUp,
                disabled: rowIndex === 0,
                separatorBefore: true,
                onSelect: () => run(onMove(u.id, "up")),
              },
              {
                id: "down",
                label: CATALOG_TEXT.opDown,
                disabled: rowIndex === units.length - 1,
                onSelect: () => run(onMove(u.id, "down")),
              },
              {
                id: "delete",
                label: CATALOG_TEXT.opDelete,
                danger: true as const,
                separatorBefore: true,
                confirm: {
                  verb: CATALOG_TEXT.opDelete,
                  target: u.name,
                  consequence: CATALOG_TEXT.unitDeleteConsequence,
                  onConfirm: () => run(onDelete(u.id)),
                },
              },
            ]}
          />
        )}
      />
      </div>

      <DialogForm
        open={dialog !== null}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        title={dialog?.mode === "rename" ? CATALOG_TEXT.renameUnit : CATALOG_TEXT.addUnit}
        submitLabel={CATALOG_TEXT.saveUnit}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          submitDialog();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="unit-code">{CATALOG_TEXT.unitCode}</FieldLabel>
            <Input
              id="unit-code"
              value={dialog?.code ?? ""}
              disabled={pending || dialog?.mode === "rename"}
              onChange={(e) => setDialog((d) => (d ? { ...d, code: e.target.value } : d))}
            />
            <FieldDescription>{CATALOG_TEXT.unitCodeHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="unit-name">{CATALOG_TEXT.colUnitName}</FieldLabel>
            <Input
              id="unit-name"
              value={dialog?.name ?? ""}
              disabled={pending}
              onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
            />
          </Field>
        </FieldGroup>
        {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
      </DialogForm>
    </Section>
  );
}
