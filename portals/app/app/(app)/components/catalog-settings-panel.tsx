"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
  Button,
  Card,
  DataTable,
  Field,
  FieldLabel,
  Input,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import type { ProductRecord, ProductTypeRecord } from "../../domains/catalog/store";
import { useMessages } from "../lib/i18n/provider";

// 产品系统设置 - the gear's destination (owner ruling 2026-09-05): what is
// configured here is the product SYSTEM, not any one product.
//
// TWO SECTIONS WITH TWO NATURES, and the page says so rather than blurring it:
//
// - TYPES are the workspace's own vocabulary, fully editable. The form upserts
//   by code, so saving an existing code renames; the row menu retires or
//   reinstates; the arrows order the header's breakdown cells. A type is never
//   deleted - products reference it by value, and the count column shows
//   exactly what a retirement leaves behind.
//
// - STATUSES are DISPLAYED with their meaning and deliberately not editable: a
//   status carries behaviour (only 在售 is quotable), so a workspace-invented
//   one would be a state the pricing and quoting rules cannot interpret.

export interface CatalogSettingsPanelProps {
  readonly types: readonly ProductTypeRecord[];
  readonly products: readonly ProductRecord[];
  readonly onSaveType: (input: {
    typeCode: string;
    name: string;
    status?: "active" | "retired";
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onMoveType: (id: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
}

export function CatalogSettingsPanel({
  types,
  products,
  onSaveType,
  onMoveType,
}: CatalogSettingsPanelProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS } = useMessages();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const inUse = (typeCode: string) =>
    products.filter((p) => p.category === typeCode).length;

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

  const save = () => {
    setErr(null);
    setSaved(false);
    startTransition(() => {
      void onSaveType({ typeCode: code.trim(), name: name.trim() }).then((r) => {
        if (r.ok) {
          setSaved(true);
          setCode("");
          setName("");
        } else {
          setErr(CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied);
        }
      });
    });
  };

  const STATUS_ROWS = [
    { key: "in_development", label: CATALOG_TEXT.statusDev, tone: "info" as const, meaning: CATALOG_TEXT.statusMeaningDev },
    { key: "active", label: CATALOG_TEXT.statusActive, tone: "success" as const, meaning: CATALOG_TEXT.statusMeaningActive },
    { key: "retired", label: CATALOG_TEXT.statusRetired, tone: "neutral" as const, meaning: CATALOG_TEXT.statusMeaningRetired },
  ];

  return (
    <>
      <Section icon="stack" title={CATALOG_TEXT.typesTitle} description={CATALOG_TEXT.typesWhy}>
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
                <span className="tabular-nums">{CATALOG_TEXT.typeInUse(inUse(t.typeCode))}</span>
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
                  id: "toggle",
                  label: t.status === "active" ? CATALOG_TEXT.typeRetire : CATALOG_TEXT.typeReinstate,
                  onSelect: () =>
                    run(
                      onSaveType({
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
                  onSelect: () => run(onMoveType(t.id, "up")),
                },
                {
                  id: "down",
                  label: CATALOG_TEXT.opDown,
                  disabled: rowIndex === types.length - 1,
                  onSelect: () => run(onMoveType(t.id, "down")),
                },
              ]}
            />
          )}
        />

        {/* Mint or rename - by code, like every anchor in this product. */}
        <div className="mt-md flex max-w-xl flex-wrap items-end gap-md">
          <Field className="min-w-32 flex-1">
            <FieldLabel>{CATALOG_TEXT.typeCode}</FieldLabel>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field className="min-w-32 flex-1">
            <FieldLabel>{CATALOG_TEXT.typeName}</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button disabled={pending || !code.trim() || !name.trim()} onClick={save}>
            {CATALOG_TEXT.addType}
          </Button>
          {saved ? <StatusBadge tone="success">{CATALOG_TEXT.typeSaved}</StatusBadge> : null}
          {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
        </div>
        <p className="text-muted-foreground mt-xs text-body-sm">{CATALOG_TEXT.typeCodeHint}</p>
      </Section>

      <Section
        icon="list-checks"
        title={CATALOG_TEXT.statusesTitle}
        description={CATALOG_TEXT.statusesWhy}
      >
        <div className="grid gap-sm sm:grid-cols-3">
          {STATUS_ROWS.map((s) => (
            <Card key={s.key} className="p-md">
              <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
              <p className="text-muted-foreground mt-sm text-body-sm">{s.meaning}</p>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
