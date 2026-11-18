"use client";
import { VocabularyConfig } from "./vocabulary-config";
import type { StrategyOption } from "../../domains/strategy/lib/strategy-result";
import { useMessages } from "../lib/i18n/provider";
export function StrategyOptionConfig({
  rows,
  editable,
  onSave,
}: {
  readonly rows: readonly StrategyOption[];
  readonly editable: boolean;
  readonly onSave: (
    input: StrategyOption,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { STRATEGY_RESULT_TEXT: T, PLAN_ERROR } = useMessages();
  return (
    <>
      {(["value", "path"] as const).map((kind) => (
        <VocabularyConfig
          key={kind}
          rows={rows.filter((o) => o.kind === kind)}
          idPrefix={`strategy-option-${kind}`}
          editable={editable}
          icon={kind === "value" ? "star" : "git-branch"}
          errors={PLAN_ERROR}
          text={{
            title: kind === "value" ? T.configValue : T.configPath,
            why: T.configHelp,
            noun: kind === "value" ? T.configValue : T.configPath,
            add: T.add,
            save: T.save,
            codeLabel: T.configCode,
            codeHint: T.configHelp,
            nameLabel: T.configName,
            colName: T.configName,
            deleteConsequence: T.configHelp,
          }}
          columns={[
            {
              id: "enabled",
              header: T.enable,
              cell: (r) => (r.enabled ? T.enable : T.disable),
            },
          ]}
          extraDefaults={{
            id: "",
            kind,
            enabled: true,
            sortOrder: rows.filter((o) => o.kind === kind).length,
          }}
          extraFromRow={(r) => ({
            id: r.id,
            kind: r.kind,
            enabled: r.enabled,
            sortOrder: r.sortOrder,
          })}
          extraActions={(r, run) => [
            {
              id: "availability",
              label: r.enabled ? T.disable : T.enable,
              onSelect: () => run(onSave({ ...r, enabled: !r.enabled })),
            },
          ]}
          deleteHiddenWhen={() => true}
          onDelete={async () => ({ ok: false, error: "denied" })}
          onSave={onSave}
        />
      ))}
    </>
  );
}
