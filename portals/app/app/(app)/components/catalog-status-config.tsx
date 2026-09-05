"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
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
  useToast,
} from "@vxture/design-ui";
import type { ProductRecord, ProductStatusRecord } from "../../domains/catalog/store";
import { isSystemStatus } from "../../domains/catalog/lib/status-vocab";
import { statusTone } from "./status-label";
import { useMessages } from "../lib/i18n/provider";

// 产品状态 - the config page's OTHER independent vocabulary (owner ruling
// 2026-09-05: 状态是状态 - this file and the type config import nothing from
// each other). A status describes ONLY what stage a product is at; the rows
// themselves are the content, and a status has no status of its own.
//
// COLUMNS AS RULED: 序号 | 状态名称 | 关联产品 | 状态描述 | 操作(右侧锁定).
// The width tiers (md / sm / lg) are the SAME sequence the type config uses,
// so the two tables line up column for column.
//
// Operations in the row menu: 重命名 / 上移 / 下移 / 删除 - no 停用/启用,
// because this table has no enablement to toggle. The three canonical rows
// never offer 删除 (the module page's rosters and the 上线/退役 operations
// are wired to them); added rows take the full set.

export interface CatalogStatusConfigProps {
  readonly statuses: readonly ProductStatusRecord[];
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: {
    statusCode: string;
    name: string;
    description?: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onMove: (id: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function CatalogStatusConfig({
  statuses,
  products,
  onSave,
  onMove,
  onDelete,
}: CatalogStatusConfigProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS } = useMessages();
  const [dialog, setDialog] = useState<{
    mode: "create" | "rename";
    code: string;
    name: string;
    description: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const inUse = (statusId: string) => products.filter((p) => p.statusId === statusId).length;

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
      void onSave({
        statusCode: dialog.code.trim(),
        name: dialog.name.trim(),
        description: dialog.description.trim() || null,
      }).then((r) => {
        if (r.ok) setDialog(null);
        else setErr(CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied);
      });
    });
  };

  return (
    <Section
      title={CATALOG_TEXT.statusesTitle}
      description={CATALOG_TEXT.statusesWhy}
      action={
        <Button
          onClick={() => {
            setErr(null);
            setDialog({ mode: "create", code: "", name: "", description: "" });
          }}
        >
          {CATALOG_TEXT.addStatus}
        </Button>
      }
    >
      {/* Two constraints from outside, not a restyle of the DS (TD-022):
          - table-fixed: the DS width tiers are MIN-widths, and under auto
            table layout actual widths drift with content - the twin config
            tables then disagree on where columns sit (owner: 列宽保持一致).
          - th:last-child w-control-3xl: the DS documents its action column
            as FIXED and pinned, but ships only min-w-control-3xl, and fixed
            layout ignores minimums - without an explicit width the action
            column swallows an equal share. Same token the DS's own 序号
            column uses, so the two edge columns match. */}
      <div className="[&_table]:table-fixed [&_thead_th:last-child]:w-control-3xl">
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        rowKey={(r: ProductStatusRecord) => r.id}
        rows={[...statuses]}
        columns={[
          {
            id: "name",
            header: CATALOG_TEXT.colStatusName,
            width: "md" as const,
            cell: (r: ProductStatusRecord) => (
              <StatusBadge tone={statusTone(r)}>{r.name}</StatusBadge>
            ),
          },
          {
            id: "linked",
            header: CATALOG_TEXT.colLinkedProducts,
            width: "sm" as const,
            align: "center" as const,
            cell: (r: ProductStatusRecord) => (
              <span className="tabular-nums">{CATALOG_TEXT.linkedCount(inUse(r.id))}</span>
            ),
          },
          {
            id: "description",
            header: CATALOG_TEXT.colStatusDesc,
            width: "lg" as const,
            cell: (r: ProductStatusRecord) => (
              <span className="text-muted-foreground text-body-sm">{r.description ?? ""}</span>
            ),
          },
        ]}
        rowActions={(r: ProductStatusRecord, rowIndex: number) => (
          <ActionMenu
            disabled={pending}
            items={[
              {
                id: "rename",
                label: CATALOG_TEXT.renameStatus,
                onSelect: () => {
                  setErr(null);
                  setDialog({
                    mode: "rename",
                    code: r.statusCode,
                    name: r.name,
                    description: r.description ?? "",
                  });
                },
              },
              {
                id: "up",
                label: CATALOG_TEXT.opUp,
                disabled: rowIndex === 0,
                separatorBefore: true,
                onSelect: () => run(onMove(r.id, "up")),
              },
              {
                id: "down",
                label: CATALOG_TEXT.opDown,
                disabled: rowIndex === statuses.length - 1,
                onSelect: () => run(onMove(r.id, "down")),
              },
              // Delete never succeeds on a canonical row (the rule refuses it
              // in every world), so it is not offered there.
              ...(isSystemStatus(r.statusCode)
                ? []
                : [
                    {
                      id: "delete",
                      label: CATALOG_TEXT.opDelete,
                      danger: true as const,
                      separatorBefore: true,
                      confirm: {
                        verb: CATALOG_TEXT.opDelete,
                        target: r.name,
                        consequence: CATALOG_TEXT.statusDeleteConsequence,
                        onConfirm: () => run(onDelete(r.id)),
                      },
                    },
                  ]),
            ]}
          />
        )}
      />
      </div>

      <DialogForm
        open={dialog !== null}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        title={dialog?.mode === "rename" ? CATALOG_TEXT.renameStatus : CATALOG_TEXT.addStatus}
        submitLabel={CATALOG_TEXT.saveStatus}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          submitDialog();
        }}
      >
        {/* Field groups - see catalog-type-config.tsx for why loose
            Label/Input siblings floated apart and wrapped. */}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="status-code">{CATALOG_TEXT.statusCode}</FieldLabel>
            <Input
              id="status-code"
              value={dialog?.code ?? ""}
              disabled={pending || dialog?.mode === "rename"}
              onChange={(e) => setDialog((d) => (d ? { ...d, code: e.target.value } : d))}
            />
            <FieldDescription>{CATALOG_TEXT.statusCodeHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="status-name">{CATALOG_TEXT.colStatusName}</FieldLabel>
            <Input
              id="status-name"
              value={dialog?.name ?? ""}
              disabled={pending}
              onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="status-desc">{CATALOG_TEXT.colStatusDesc}</FieldLabel>
            <Input
              id="status-desc"
              value={dialog?.description ?? ""}
              disabled={pending}
              onChange={(e) => setDialog((d) => (d ? { ...d, description: e.target.value } : d))}
            />
          </Field>
        </FieldGroup>
        {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
      </DialogForm>
    </Section>
  );
}
