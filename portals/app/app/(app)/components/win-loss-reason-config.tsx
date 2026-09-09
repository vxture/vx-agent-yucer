"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Checkbox,
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
import type { WinLossReasonRecord } from "../../domains/pipeline/store";
import { useMessages } from "../lib/i18n/provider";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  RowActions,
  rowClickSelection,
  useTableSort,
} from "./table-fittings";

// 赢丢原因 - the workspace's own list (incr/0039).
//
// WHY IT IS CONFIGURED AT ALL. It was six literals in the build, and the
// column behind it had no CHECK: a workspace could not add 被集成商截胡 without
// a release, so it used 其他, and 赢丢复盘 then reported that most losses had
// no reason. The list a company loses on is the company's own.
//
// TWO CHECKBOXES, NOT A THIRD STATE. A reason may explain a win, a loss, or
// both, and 客户未决 explains only a loss - "won because the customer did not
// decide" is a sentence with no meaning. One column with three values would
// have made "both" the odd case rather than the common one.
//
// DELETION IS REFUSED WHILE REVIEWS CITE IT, and that is not a soft rule: a
// review's reason is EVIDENCE about a closed deal, and deleting the row it
// points at would rewrite what somebody concluded. The count is on the row so
// the refusal is predictable before it is met.

type Dialog = {
  mode: "create" | "rename";
  code: string;
  name: string;
  forWon: boolean;
  forLost: boolean;
};

export function WinLossReasonConfig({
  reasons,
  usage,
  onSave,
  onMove,
  onDelete,
}: {
  readonly reasons: readonly WinLossReasonRecord[];
  /** How many reviews cite each reason, by id. */
  readonly usage: Readonly<Record<string, number>>;
  readonly onSave: (input: {
    reasonCode: string;
    name: string;
    forWon: boolean;
    forLost: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onMove: (reasonId: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (reasonId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { DATA_TABLE_LABELS, REVIEW_ERROR, WINLOSS_TEXT } = useMessages();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const sorted = useTableSort<WinLossReasonRecord>([], {
    name: (r: WinLossReasonRecord) => r.name,
    used: (r: WinLossReasonRecord) => usage[r.id] ?? 0,
  });
  const select = rowClickSelection(reasons, (r) => r.id, selected, setSelected);
  const { toast } = useToast();

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) toast({ tone: "danger", title: REVIEW_ERROR[r.error ?? "denied"] ?? r.error ?? "" });
      else setDialog(null);
    });

  return (
    <Section
      title={WINLOSS_TEXT.reasonConfigTitle}
      description={WINLOSS_TEXT.reasonConfigWhy}
      action={
        <Button
          onClick={() =>
            setDialog({ mode: "create", code: "", name: "", forWon: true, forLost: true })
          }
        >
          {WINLOSS_TEXT.addReason}
        </Button>
      }
    >
      {/* The same two constraints from outside every other config table
          carries (TD-022), so they line up column for column. */}
      <div
        ref={select.ref}
        className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} ${select.className}`}
      >
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowKey={(r: WinLossReasonRecord) => r.id}
          rows={[...sorted.sortRows(reasons)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
          columns={[
            {
              id: "name",
              sortable: true,
              header: WINLOSS_TEXT.colReasonName,
              width: "md" as const,
              cell: (r: WinLossReasonRecord) => (
                <TableTitleCell
                  title={r.name}
                  description={r.reasonCode !== r.name ? r.reasonCode : undefined}
                  tooltip={r.name}
                />
              ),
            },
            {
              id: "applies",
              header: WINLOSS_TEXT.colApplies,
              width: "sm" as const,
              cell: (r: WinLossReasonRecord) => (
                <StatusBadge tone="neutral">
                  {r.forWon && r.forLost
                    ? WINLOSS_TEXT.appliesBoth
                    : r.forWon
                      ? WINLOSS_TEXT.appliesWon
                      : WINLOSS_TEXT.appliesLost}
                </StatusBadge>
              ),
            },
            {
              id: "used",
              sortable: true,
              header: WINLOSS_TEXT.colCited,
              width: "sm" as const,
              align: "numeric" as const,
              cell: (r: WinLossReasonRecord) => (
                <span className="tabular-nums">{usage[r.id] ?? 0}</span>
              ),
            },
          ]}
          rowActions={(r: WinLossReasonRecord, rowIndex: number) => (
            <RowActions
              disabled={pending}
              items={[
                {
                  id: "rename",
                  label: WINLOSS_TEXT.editReason,
                  onSelect: () =>
                    setDialog({
                      mode: "rename",
                      code: r.reasonCode,
                      name: r.name,
                      forWon: r.forWon,
                      forLost: r.forLost,
                    }),
                },
                {
                  id: "up",
                  label: WINLOSS_TEXT.opUp,
                  disabled: rowIndex === 0,
                  separatorBefore: true,
                  onSelect: () => run(onMove(r.id, "up")),
                },
                {
                  id: "down",
                  label: WINLOSS_TEXT.opDown,
                  disabled: rowIndex === reasons.length - 1,
                  onSelect: () => run(onMove(r.id, "down")),
                },
                {
                  id: "delete",
                  label: WINLOSS_TEXT.opDelete,
                  danger: true as const,
                  separatorBefore: true,
                  // OFFERED ONLY WHEN NOTHING CITES IT: the rule refuses either
                  // way, and a control whose refusal is predictable should not
                  // be a control.
                  disabled: (usage[r.id] ?? 0) > 0,
                  confirm: {
                    verb: WINLOSS_TEXT.opDelete,
                    target: r.name,
                    consequence: WINLOSS_TEXT.reasonDeleteConsequence,
                    onConfirm: () => run(onDelete(r.id)),
                  },
                },
              ]}
            />
          )}
        />
      </div>

      <DialogForm
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialog?.mode === "rename" ? WINLOSS_TEXT.editReason : WINLOSS_TEXT.addReason}
        submitLabel={WINLOSS_TEXT.saveReason}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          if (dialog) {
            run(
              onSave({
                reasonCode: dialog.code.trim(),
                name: dialog.name.trim(),
                forWon: dialog.forWon,
                forLost: dialog.forLost,
              }),
            );
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="wlr-code">{WINLOSS_TEXT.reasonCode}</FieldLabel>
            <Input
              id="wlr-code"
              value={dialog?.code ?? ""}
              /* The anchor: every review points at this row by uuid, but the
                 code is what an import matches on. Locked after creation. */
              disabled={pending || dialog?.mode === "rename"}
              onChange={(e) => setDialog((d) => (d ? { ...d, code: e.target.value } : d))}
            />
            <FieldDescription>{WINLOSS_TEXT.reasonCodeHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="wlr-name">{WINLOSS_TEXT.reasonName}</FieldLabel>
            <Input
              id="wlr-name"
              value={dialog?.name ?? ""}
              disabled={pending}
              onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
            />
          </Field>
          <Field>
            <FieldLabel>{WINLOSS_TEXT.colApplies}</FieldLabel>
            <label className="gap-sm flex items-center">
              <Checkbox
                checked={dialog?.forWon ?? true}
                onCheckedChange={(v) =>
                  setDialog((d) => (d ? { ...d, forWon: v === true } : d))
                }
              />
              <span className="text-body-sm">{WINLOSS_TEXT.appliesWon}</span>
            </label>
            <label className="gap-sm flex items-center">
              <Checkbox
                checked={dialog?.forLost ?? true}
                onCheckedChange={(v) =>
                  setDialog((d) => (d ? { ...d, forLost: v === true } : d))
                }
              />
              <span className="text-body-sm">{WINLOSS_TEXT.appliesLost}</span>
            </label>
            <FieldDescription>{WINLOSS_TEXT.appliesHint}</FieldDescription>
          </Field>
        </FieldGroup>
      </DialogForm>
    </Section>
  );
}
