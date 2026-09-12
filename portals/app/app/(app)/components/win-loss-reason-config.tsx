"use client";

import { Checkbox, Field, FieldDescription, FieldLabel } from "@vxture/design-ui";
import type { WinLossReasonRecord } from "../../domains/pipeline/store";
import { useMessages } from "../lib/i18n/provider";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import { Tag } from "./tag";
import type { MoveDirection } from "../../domains/shared/ordering";

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
// have made "both" the odd case rather than the common one. This is the one
// thing this vocabulary has that the others do not, and it is exactly what the
// shared panel takes as its extra column and extra field.
//
// DELETION IS REFUSED WHILE REVIEWS CITE IT, and that is not a soft rule: a
// review's reason is EVIDENCE about a closed deal, and deleting the row it
// points at would rewrite what somebody concluded. The count is on the row so
// the refusal is predictable before it is met.

type Applies = { forWon: boolean; forLost: boolean };

export function WinLossReasonConfig({
  reasons,
  usage,
  editable,
  onSave,
  onMove,
  onDelete,
}: {
  readonly reasons: readonly WinLossReasonRecord[];
  /** How many reviews cite each reason, by id. */
  readonly usage: Readonly<Record<string, number>>;
  /** `pipeline.winloss.record` - the page checks this, this panel only renders it. */
  readonly editable: boolean;
  readonly onSave: (input: {
    reasonCode: string;
    name: string;
    forWon: boolean;
    forLost: boolean;
  }) => Promise<VocabularyResult>;
  readonly onMove: (reasonId: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (reasonId: string) => Promise<VocabularyResult>;
}) {
  const { REVIEW_ERROR, WINLOSS_TEXT } = useMessages();
  const rows = reasons.map((r) => ({ ...r, code: r.reasonCode }));

  return (
    <VocabularyConfig
      rows={rows}
      idPrefix="wlr"
      errors={REVIEW_ERROR}
      editable={editable}
      page={{ icon: "clock-counter-clockwise", count: WINLOSS_TEXT.reasonCount }}
      text={{
        title: WINLOSS_TEXT.reasonConfigTitle,
        noun: WINLOSS_TEXT.reasonNoun,
        why: WINLOSS_TEXT.reasonConfigWhy,
        add: WINLOSS_TEXT.addReason,
        save: WINLOSS_TEXT.saveReason,
        codeLabel: WINLOSS_TEXT.reasonCode,
        codeHint: WINLOSS_TEXT.reasonCodeHint,
        nameLabel: WINLOSS_TEXT.reasonName,
        colName: WINLOSS_TEXT.colReasonName,
        deleteConsequence: WINLOSS_TEXT.reasonDeleteConsequence,
      }}
      columns={[
        {
          id: "applies",
          header: WINLOSS_TEXT.colApplies,
          width: "sm",
          cell: (r) => (
            <Tag>
              {r.forWon && r.forLost
                ? WINLOSS_TEXT.appliesBoth
                : r.forWon
                  ? WINLOSS_TEXT.appliesWon
                  : WINLOSS_TEXT.appliesLost}
            </Tag>
          ),
        },
        {
          id: "used",
          sortable: true,
          header: WINLOSS_TEXT.colCited,
          width: "sm",
          // A short count: centred by default. See division-panel.
          
          cell: (r) => <span className="tabular-nums">{usage[r.id] ?? 0}</span>,
        },
      ]}
      sortOn={{ used: (r) => usage[r.id] ?? 0 }}
      deletableWhen={(r) => (usage[r.id] ?? 0) === 0}
      extraDefaults={{ forWon: true, forLost: true } as Applies}
      extraFromRow={(r) => ({ forWon: r.forWon, forLost: r.forLost })}
      renderExtra={(v, set, disabled) => (
        <Field>
          <FieldLabel>{WINLOSS_TEXT.colApplies}</FieldLabel>
          <label className="gap-sm flex items-center">
            <Checkbox
              checked={v.forWon}
              disabled={disabled}
              onCheckedChange={(c) => set({ ...v, forWon: c === true })}
            />
            <span className="text-body-sm">{WINLOSS_TEXT.appliesWon}</span>
          </label>
          <label className="gap-sm flex items-center">
            <Checkbox
              checked={v.forLost}
              disabled={disabled}
              onCheckedChange={(c) => set({ ...v, forLost: c === true })}
            />
            <span className="text-body-sm">{WINLOSS_TEXT.appliesLost}</span>
          </label>
          <FieldDescription>{WINLOSS_TEXT.appliesHint}</FieldDescription>
        </Field>
      )}
      onSave={(input) =>
        onSave({
          reasonCode: input.code,
          name: input.name,
          forWon: input.forWon,
          forLost: input.forLost,
        })
      }
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}
