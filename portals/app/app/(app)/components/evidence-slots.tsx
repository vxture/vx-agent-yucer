"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Field,
  FieldLabel,
  Icon,
  NativeSelect,
  StatusBadge,
  Textarea,
} from "@vxture/design-ui";
import { DialogForm } from "./dialog-form";
import { Tag } from "./tag";
import { useMessages } from "../lib/i18n/provider";

// 购买证据槽 (incr/0085): one row per slot - its name, the latest statement or
// 未写明, and whether it is 有据 (cites a follow-up) or 口述. Used in two
// panels with different slots: 购买理由 (栏2: 痛点 / 量化价值 / 不作为) and 决策流程's
// lower half (栏1: 决策流程 / 签约流程).
//
// EMPTY IS EMPTY (YC-069 §07): an unwritten slot says 未写明 and shows no
// example phrasing - an example gets copied in and then counted as filled.
//
// VERSIONS, NEVER OVERWRITES: 修改 appends; the slot's history opens under it.

export interface EvidenceRow {
  readonly slot: string;
  readonly statement: string | null;
  readonly grounded: boolean;
  /** "谭处端 · 09-03" - who wrote the latest, and when. */
  readonly meta: string | null;
  /** The cited follow-up, labelled ("09-15 电话"), when grounded. */
  readonly cite: string | null;
  readonly citeId: string | null;
  readonly accepted: boolean;
  /** Earlier versions, newest first, already labelled. */
  readonly history: readonly { readonly id: string; readonly statement: string; readonly meta: string }[];
}

export function EvidenceSlots({
  opportunityId,
  rows,
  citable,
  canRecord,
  compact = false,
  onRecord,
}: {
  readonly opportunityId: string;
  readonly rows: readonly EvidenceRow[];
  /** This deal's follow-ups, newest first: what a statement may cite. */
  readonly citable: readonly { readonly id: string; readonly label: string }[];
  readonly canRecord: boolean;
  /** 栏1 width: the meta goes under the statement instead of beside it. */
  readonly compact?: boolean;
  readonly onRecord: (
    opportunityId: string,
    input: { slot: string; statement: string; interactionId?: string | null },
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { DEAL_PAGE_TEXT, EVIDENCE_ERROR } = useMessages();
  const [editing, setEditing] = useState<EvidenceRow | null>(null);
  const [statement, setStatement] = useState("");
  const [cite, setCite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (row: EvidenceRow) => {
    setEditing(row);
    setStatement(row.statement ?? "");
    setCite(row.citeId ?? "");
    setError(null);
  };

  const save = () => {
    if (!editing) return;
    start(async () => {
      const r = await onRecord(opportunityId, { slot: editing.slot, statement, interactionId: cite || null });
      if (!r.ok) {
        setError(EVIDENCE_ERROR[r.error ?? "denied"] ?? EVIDENCE_ERROR.denied ?? null);
        return;
      }
      setEditing(null);
    });
  };

  const label = (slot: string) => DEAL_PAGE_TEXT.evidenceSlot[slot] ?? slot;

  return (
    <div className="divide-primary/10 dark:divide-primary/20 flex flex-col divide-y divide-dashed">
      {rows.map((row) => (
        <div key={row.slot} className="flex flex-col gap-2xs py-xs">
          <div className="flex items-start gap-sm text-body-sm">
            <span className="text-muted-foreground w-16 flex-none">{label(row.slot)}</span>
            <span className={`min-w-0 flex-1 whitespace-pre-wrap ${row.statement ? "text-foreground" : "text-muted-foreground"}`}>
              {row.statement ?? DEAL_PAGE_TEXT.evidenceEmpty}
            </span>
            {!compact && row.statement ? <SlotMarks row={row} /> : null}
            {canRecord ? (
              <Button variant="ghost" size="sm" className="h-auto flex-none py-0" onClick={() => open(row)}>
                {row.statement ? DEAL_PAGE_TEXT.evidenceEdit : DEAL_PAGE_TEXT.evidenceFill}
              </Button>
            ) : null}
          </div>
          {compact && row.statement ? (
            <div className="pl-[4.5rem]">
              <SlotMarks row={row} />
            </div>
          ) : null}
          {row.history.length > 0 ? (
            <Collapsible>
              <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-2xs pl-[4.5rem] text-body-sm">
                <Icon name="chevron-right" size="xs" />
                {DEAL_PAGE_TEXT.evidenceHistory(row.history.length)}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ol className="mt-2xs flex flex-col gap-2xs pl-[4.5rem]">
                  {row.history.map((h) => (
                    <li key={h.id} className="text-muted-foreground text-body-sm">
                      <span className="line-through decoration-muted-foreground/40">{h.statement || DEAL_PAGE_TEXT.evidenceCleared}</span>
                      <span> · {h.meta}</span>
                    </li>
                  ))}
                </ol>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ))}

      <DialogForm
        open={editing !== null}
        onOpenChange={(o) => (o ? null : setEditing(null))}
        title={editing ? DEAL_PAGE_TEXT.evidenceDialog(label(editing.slot)) : ""}
        description={DEAL_PAGE_TEXT.evidenceDialogWhy}
        submitLabel={DEAL_PAGE_TEXT.evidenceSave}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field>
          <FieldLabel htmlFor="evidence-statement">{DEAL_PAGE_TEXT.evidenceStatement}</FieldLabel>
          <Textarea
            id="evidence-statement"
            value={statement}
            maxLength={2000}
            onChange={(e) => setStatement(e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="evidence-cite">{DEAL_PAGE_TEXT.evidenceCite}</FieldLabel>
          <NativeSelect id="evidence-cite" value={cite} onChange={(e) => setCite(e.target.value)} disabled={pending}>
            <option value="">{DEAL_PAGE_TEXT.evidenceCiteNone}</option>
            {citable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </DialogForm>
    </div>
  );
}

function SlotMarks({ row }: { readonly row: EvidenceRow }) {
  const { DEAL_PAGE_TEXT } = useMessages();
  return (
    <span className="text-muted-foreground flex flex-none flex-wrap items-center gap-xs text-body-sm">
      <span title={row.cite ?? undefined}>
        <Tag tone={row.grounded ? "success" : "neutral"}>{row.grounded ? DEAL_PAGE_TEXT.evidenceGrounded : DEAL_PAGE_TEXT.evidenceSaid}</Tag>
      </span>
      {row.accepted ? <Tag tone="info">{DEAL_PAGE_TEXT.evidenceAccepted}</Tag> : null}
      {row.meta ? <span className="tabular-nums">{row.meta}</span> : null}
    </span>
  );
}
