"use client";

import { useState, useTransition } from "react";
import {
  ActionMenu,
  Button,
  DataTable,
  DialogForm,
  Input,
  Label,
  NativeSelect,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import type { ProductRecord } from "../../domains/catalog/store";
import {
  isSystemStatus,
  STATUS_BEHAVIORS,
  type StatusBehavior,
  type StatusVocabRow,
} from "../../domains/catalog/lib/lifecycle";
import { BEHAVIOR_TONE, statusLabelOf } from "./status-label";
import { useMessages } from "../lib/i18n/provider";

// 产品状态 - the config page's OTHER independent vocabulary (owner ruling
// 2026-09-05: 状态是状态, its own file, coupled to nothing). Same mechanism
// as the type table: display rows, a dialog for create/rename, the full
// operation set in the row menu.
//
// The one thing a status has that a type does not is a BEHAVIOR - what the
// rules read (only active-behaviour rows are quotable). It is chosen at
// creation and never edited (no UPDATE grant on the column), and the three
// SYSTEM rows are protected by the rule layer: never deleted, and 在售/已退役
// never disabled. The menu still renders every operation; the rule answers
// with its reason when one is refused - except delete on a system row, which
// is omitted outright because it can never succeed.

export interface CatalogStatusConfigProps {
  readonly statuses: readonly StatusVocabRow[];
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: {
    statusCode: string;
    name?: string | null;
    behavior?: StatusBehavior;
    status?: "active" | "retired";
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onMove: (statusCode: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (statusCode: string) => Promise<{ ok: boolean; error?: string }>;
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
    behavior: StatusBehavior;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const inUse = (code: string) => products.filter((p) => p.status === code).length;

  const BEHAVIOR_LABEL: Record<StatusBehavior, string> = {
    in_development: CATALOG_TEXT.statusDev,
    active: CATALOG_TEXT.statusActive,
    retired: CATALOG_TEXT.statusRetired,
  };
  const BEHAVIOR_MEANING: Record<StatusBehavior, string> = {
    in_development: CATALOG_TEXT.statusMeaningDev,
    active: CATALOG_TEXT.statusMeaningActive,
    retired: CATALOG_TEXT.statusMeaningRetired,
  };

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
        name: dialog.name.trim() || null,
        ...(dialog.mode === "create" ? { behavior: dialog.behavior } : {}),
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
            setDialog({ mode: "create", code: "", name: "", behavior: "active" });
          }}
        >
          {CATALOG_TEXT.addStatus}
        </Button>
      }
    >
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        rowKey={(r: StatusVocabRow) => r.statusCode}
        rows={[...statuses]}
        columns={[
          {
            id: "name",
            header: CATALOG_TEXT.colName,
            cell: (r: StatusVocabRow) => {
              const label = statusLabelOf(r, CATALOG_TEXT);
              return (
                <span className="flex min-w-0 flex-col">
                  <span className="text-foreground truncate">{label}</span>
                  {r.statusCode !== label ? (
                    <span className="text-muted-foreground mono truncate text-body-sm">
                      {r.statusCode}
                    </span>
                  ) : null}
                </span>
              );
            },
          },
          {
            id: "behavior",
            header: CATALOG_TEXT.colBehavior,
            cell: (r: StatusVocabRow) => (
              // The meaning rides the hover: a column of three sentences would
              // drown the table, but the sentence is exactly what someone
              // picking a behavior needs once.
              <span title={BEHAVIOR_MEANING[r.behavior]}>
                <StatusBadge tone={BEHAVIOR_TONE[r.behavior]}>
                  {BEHAVIOR_LABEL[r.behavior]}
                </StatusBadge>
              </span>
            ),
          },
          {
            id: "inUse",
            header: CATALOG_TEXT.products,
            cell: (r: StatusVocabRow) => (
              <span className="tabular-nums">{CATALOG_TEXT.typeInUse(inUse(r.statusCode))}</span>
            ),
          },
          {
            id: "status",
            header: CATALOG_TEXT.colStatus,
            cell: (r: StatusVocabRow) =>
              r.status === "retired" ? (
                <StatusBadge tone="neutral">{CATALOG_TEXT.typeRetiredBadge}</StatusBadge>
              ) : (
                <StatusBadge tone="success">{CATALOG_TEXT.statusActive}</StatusBadge>
              ),
          },
        ]}
        rowActions={(r: StatusVocabRow, rowIndex: number) => (
          <ActionMenu
            disabled={pending}
            items={[
              {
                id: "rename",
                label: CATALOG_TEXT.renameType,
                onSelect: () => {
                  setErr(null);
                  setDialog({
                    mode: "rename",
                    code: r.statusCode,
                    name: r.name ?? "",
                    behavior: r.behavior,
                  });
                },
              },
              {
                id: "toggle",
                label: r.status === "active" ? CATALOG_TEXT.typeRetire : CATALOG_TEXT.typeReinstate,
                onSelect: () =>
                  run(
                    onSave({
                      statusCode: r.statusCode,
                      status: r.status === "active" ? "retired" : "active",
                    }),
                  ),
              },
              {
                id: "up",
                label: CATALOG_TEXT.opUp,
                disabled: rowIndex === 0,
                separatorBefore: true,
                onSelect: () => run(onMove(r.statusCode, "up")),
              },
              {
                id: "down",
                label: CATALOG_TEXT.opDown,
                disabled: rowIndex === statuses.length - 1,
                onSelect: () => run(onMove(r.statusCode, "down")),
              },
              // Delete never succeeds on a system row (the rule refuses it in
              // every world), so it is not offered there - the row menus of
              // this product only list moves that CAN land.
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
                        target: statusLabelOf(r, CATALOG_TEXT),
                        consequence: CATALOG_TEXT.statusDeleteConsequence,
                        onConfirm: () => run(onDelete(r.statusCode)),
                      },
                    },
                  ]),
            ]}
          />
        )}
      />

      <DialogForm
        open={dialog !== null}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        title={dialog?.mode === "rename" ? CATALOG_TEXT.renameType : CATALOG_TEXT.addStatus}
        description={CATALOG_TEXT.behaviorHint}
        submitLabel={CATALOG_TEXT.saveStatus}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          submitDialog();
        }}
      >
        <Label htmlFor="status-code">{CATALOG_TEXT.colCode}</Label>
        <Input
          id="status-code"
          value={dialog?.code ?? ""}
          disabled={pending || dialog?.mode === "rename"}
          onChange={(e) => setDialog((d) => (d ? { ...d, code: e.target.value } : d))}
        />
        <Label htmlFor="status-name">{CATALOG_TEXT.colName}</Label>
        <Input
          id="status-name"
          value={dialog?.name ?? ""}
          disabled={pending}
          onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
        />
        {dialog?.mode === "create" ? (
          <>
            <Label htmlFor="status-behavior">{CATALOG_TEXT.colBehavior}</Label>
            <NativeSelect
              id="status-behavior"
              value={dialog.behavior}
              disabled={pending}
              onChange={(e) =>
                setDialog((d) => (d ? { ...d, behavior: e.target.value as StatusBehavior } : d))
              }
            >
              {STATUS_BEHAVIORS.map((b) => (
                <option key={b} value={b}>
                  {BEHAVIOR_LABEL[b]}
                </option>
              ))}
            </NativeSelect>
          </>
        ) : null}
        {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
      </DialogForm>
    </Section>
  );
}
