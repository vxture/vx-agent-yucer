"use client";

import { Field, FieldDescription, FieldLabel, Input } from "@vxture/design-ui";
import type { StageDefinitionRecord } from "../../domains/pipeline/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import { Tag } from "./tag";
import type { MoveDirection } from "../../domains/shared/ordering";

// 商机阶段 - the workspace's own catalog (incr/0057-0059).
//
// WHY isWon/isTerminal ARE NOT CHECKBOXES HERE. A tenant may rename, reorder,
// re-price and add/remove a stage, but "which code counts as won" and "which
// counts as a terminal loss" is not exposed as a toggle in this panel - a new
// stage is always created open (non-terminal, non-won), matching the DDL's own
// invariant that a won row is fixed at 100% and a terminal, non-won row at 0%.
// Editing an EXISTING won/terminal row keeps its flags exactly as they are;
// only its name may change. Retiring/promoting which code is "won" is a
// bigger, more consequential decision (planStageRemoval refuses removing the
// last one) that this PR deliberately leaves as rename + add + remove, not a
// flag flip on a live row.
//
// DEFAULT WIN RATE follows the same split as the DDL's CHECK constraints: an
// open stage's is genuinely editable, a won/terminal one is shown fixed.

type Extra = { defaultProbability: number; isWon: boolean; isTerminal: boolean };

export function StageDefinitionConfig({
  stages,
  usage,
  editable,
  onSave,
  onMove,
  onDelete,
}: {
  readonly stages: readonly StageDefinitionRecord[];
  /** How many opportunities currently sit at each stage, by id. */
  readonly usage: Readonly<Record<string, number>>;
  /** `pipeline.stage.manage` - the page checks this, this panel only renders it. */
  readonly editable: boolean;
  readonly onSave: (input: {
    code: string;
    name: string;
    defaultProbability: number;
    isWon: boolean;
    isTerminal: boolean;
  }) => Promise<VocabularyResult>;
  readonly onMove: (stageId: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (stageId: string) => Promise<VocabularyResult>;
}) {
  const { STAGE_ERROR, STAGE_CONFIG_TEXT } = useMessages();
  const rows = stages.map((s) => ({ ...s, code: s.stageCode }));

  // Client-side hints only - planStageRemoval is the real refusal, run again
  // server-side on every delete. Mirrored here so the control reads as
  // disabled rather than as a click that always fails.
  const wonCount = stages.filter((s) => s.isWon).length;
  const lostCount = stages.filter((s) => s.isTerminal && !s.isWon).length;

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="stg"
      errors={STAGE_ERROR}
      editable={editable}
      page={{ icon: "workflow", count: STAGE_CONFIG_TEXT.stageCount }}
      text={{
        title: STAGE_CONFIG_TEXT.title,
        noun: STAGE_CONFIG_TEXT.noun,
        why: STAGE_CONFIG_TEXT.why,
        add: STAGE_CONFIG_TEXT.add,
        save: STAGE_CONFIG_TEXT.save,
        codeLabel: STAGE_CONFIG_TEXT.codeLabel,
        codeHint: STAGE_CONFIG_TEXT.codeHint,
        nameLabel: STAGE_CONFIG_TEXT.nameLabel,
        colName: STAGE_CONFIG_TEXT.colName,
        deleteConsequence: STAGE_CONFIG_TEXT.deleteConsequence,
      }}
      columns={[
        {
          id: "flags",
          header: STAGE_CONFIG_TEXT.colFlags,
          width: "sm",
          cell: (r) =>
            r.isWon ? (
              <Tag tone="success">{STAGE_CONFIG_TEXT.flagWon}</Tag>
            ) : r.isTerminal ? (
              <Tag tone="danger">{STAGE_CONFIG_TEXT.flagLost}</Tag>
            ) : null,
        },
        {
          id: "probability",
          header: STAGE_CONFIG_TEXT.colProbability,
          width: "sm",
          align: "numeric",
          cell: (r) => <span className="tabular-nums">{r.defaultProbability}%</span>,
        },
        {
          id: "used",
          sortable: true,
          header: STAGE_CONFIG_TEXT.colUsed,
          width: "sm",
          cell: (r) => <span className="tabular-nums">{usage[r.id] ?? 0}</span>,
        },
      ]}
      sortOn={{ used: (r) => usage[r.id] ?? 0 }}
      deletableWhen={(r) =>
        (usage[r.id] ?? 0) === 0 &&
        !(r.isWon && wonCount <= 1) &&
        !(r.isTerminal && !r.isWon && lostCount <= 1)
      }
      extraDefaults={{ defaultProbability: 15, isWon: false, isTerminal: false } as Extra}
      extraFromRow={(r) => ({
        defaultProbability: r.defaultProbability,
        isWon: r.isWon,
        isTerminal: r.isTerminal,
      })}
      renderExtra={(v, set, disabled) => (
        <Field>
          <FieldLabel>{STAGE_CONFIG_TEXT.probabilityLabel}</FieldLabel>
          {v.isTerminal ? (
            <>
              <Tag>{v.isWon ? STAGE_CONFIG_TEXT.probabilityFixedWon : STAGE_CONFIG_TEXT.probabilityFixedLost}</Tag>
              <FieldDescription>{STAGE_CONFIG_TEXT.probabilityFixedHint}</FieldDescription>
            </>
          ) : (
            <>
              <Input
                type="number"
                min={0}
                max={100}
                value={v.defaultProbability}
                disabled={disabled}
                onChange={(e) => set({ ...v, defaultProbability: Number(e.target.value) })}
              />
              <FieldDescription>{STAGE_CONFIG_TEXT.probabilityHint}</FieldDescription>
            </>
          )}
        </Field>
      )}
      onSave={(input) =>
        onSave({
          code: input.code,
          name: input.name,
          defaultProbability: input.defaultProbability,
          isWon: input.isWon,
          isTerminal: input.isTerminal,
        })
      }
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
