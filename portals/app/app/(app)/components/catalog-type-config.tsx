"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
  Button,
  DataTable,
  DialogForm,
  Input,
  Label,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import type { ProductRecord, ProductTypeRecord } from "../../domains/catalog/store";
import { useMessages } from "../lib/i18n/provider";

// 产品类型 - one of the config page's two INDEPENDENT vocabularies (owner
// ruling 2026-09-05: 类型是类型，状态是状态 - each in its own file, coupled to
// nothing). Mechanically it is the standard vocabulary table: display rows,
// a dialog for the two-field errands (create, rename - the code locks on a
// rename because it is the workspace's anchor), and the full operation set in
// the row menu: rename / disable / enable / move / delete.
//
// Products associate by uuid (incr/0029), so the count column is a typeId
// join and DELETE has a real FK RESTRICT underneath the rule's refusal.

export interface CatalogTypeConfigProps {
  readonly types: readonly ProductTypeRecord[];
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: {
    typeCode: string;
    name: string;
    status?: "active" | "retired";
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onMove: (id: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function CatalogTypeConfig({
  types,
  products,
  onSave,
  onMove,
  onDelete,
}: CatalogTypeConfigProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS } = useMessages();
  const [dialog, setDialog] = useState<{ mode: "create" | "rename"; code: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const inUse = (typeId: string) => products.filter((p) => p.typeId === typeId).length;

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
      void onSave({ typeCode: dialog.code.trim(), name: dialog.name.trim() }).then((r) => {
        if (r.ok) setDialog(null);
        else setErr(CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied);
      });
    });
  };

  return (
    <Section
      title={CATALOG_TEXT.typesTitle}
      description={CATALOG_TEXT.typesWhy}
      action={
        <Button onClick={() => { setErr(null); setDialog({ mode: "create", code: "", name: "" }); }}>
          {CATALOG_TEXT.addType}
        </Button>
      }
    >
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        rowKey={(t: ProductTypeRecord) => t.id}
        rows={[...types]}
        columns={[
          {
            id: "name",
            header: CATALOG_TEXT.typeName,
            cell: (t: ProductTypeRecord) => (
              <span className="flex min-w-0 flex-col">
                <span className="text-foreground truncate">{t.name}</span>
                {t.typeCode !== t.name ? (
                  <span className="text-muted-foreground mono truncate text-body-sm">{t.typeCode}</span>
                ) : null}
              </span>
            ),
          },
          {
            id: "inUse",
            header: CATALOG_TEXT.products,
            cell: (t: ProductTypeRecord) => (
              <span className="tabular-nums">{CATALOG_TEXT.typeInUse(inUse(t.id))}</span>
            ),
          },
          {
            id: "status",
            header: CATALOG_TEXT.colStatus,
            cell: (t: ProductTypeRecord) =>
              t.status === "retired" ? (
                <StatusBadge tone="neutral">{CATALOG_TEXT.typeRetiredBadge}</StatusBadge>
              ) : (
                <StatusBadge tone="success">{CATALOG_TEXT.statusActive}</StatusBadge>
              ),
          },
        ]}
        rowActions={(t: ProductTypeRecord, rowIndex: number) => (
          <ActionMenu
            disabled={pending}
            items={[
              {
                id: "rename",
                label: CATALOG_TEXT.renameType,
                onSelect: () => {
                  setErr(null);
                  setDialog({ mode: "rename", code: t.typeCode, name: t.name });
                },
              },
              {
                id: "toggle",
                label: t.status === "active" ? CATALOG_TEXT.typeRetire : CATALOG_TEXT.typeReinstate,
                onSelect: () =>
                  run(
                    onSave({
                      typeCode: t.typeCode,
                      name: t.name,
                      status: t.status === "active" ? "retired" : "active",
                    }),
                  ),
              },
              {
                id: "up",
                label: CATALOG_TEXT.opUp,
                disabled: rowIndex === 0,
                separatorBefore: true,
                onSelect: () => run(onMove(t.id, "up")),
              },
              {
                id: "down",
                label: CATALOG_TEXT.opDown,
                disabled: rowIndex === types.length - 1,
                onSelect: () => run(onMove(t.id, "down")),
              },
              {
                id: "delete",
                label: CATALOG_TEXT.opDelete,
                danger: true as const,
                separatorBefore: true,
                confirm: {
                  verb: CATALOG_TEXT.opDelete,
                  target: t.name,
                  consequence: CATALOG_TEXT.typeDeleteConsequence,
                  onConfirm: () => run(onDelete(t.id)),
                },
              },
            ]}
          />
        )}
      />

      <DialogForm
        open={dialog !== null}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        title={dialog?.mode === "rename" ? CATALOG_TEXT.renameType : CATALOG_TEXT.addType}
        description={CATALOG_TEXT.typeCodeHint}
        submitLabel={CATALOG_TEXT.saveType}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          submitDialog();
        }}
      >
        <Label htmlFor="type-code">{CATALOG_TEXT.typeCode}</Label>
        <Input
          id="type-code"
          value={dialog?.code ?? ""}
          disabled={pending || dialog?.mode === "rename"}
          onChange={(e) => setDialog((d) => (d ? { ...d, code: e.target.value } : d))}
        />
        <Label htmlFor="type-name">{CATALOG_TEXT.typeName}</Label>
        <Input
          id="type-name"
          value={dialog?.name ?? ""}
          disabled={pending}
          onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
        />
        {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
      </DialogForm>
    </Section>
  );
}
