"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, FieldDescription, FieldGroup, FieldLabel, Input, StatusBadge } from "@vxture/design-ui";
import type { CompetitorRecord } from "../../domains/pipeline/lib/competition";
import { useMessages } from "../lib/i18n/provider";
import { DialogForm } from "./dialog-form";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";

// 竞争对手 - the workspace's list of rivals, and the only place one is renamed
// or removed.
//
// A rival is created by NAME the moment a seller records it on a deal, so a
// misspelling lands in the list and used to stay there for good: this list had
// no screen. It now has one.
//
// DELETION IS REFUSED WHILE ANYTHING NAMES THE RIVAL. A deal's competitive
// journal and a win/loss review are evidence of what was true when they were
// written; deleting the rival they point at would rewrite them (and the
// database restricts it too). The count is on the row so the refusal is
// predictable before it is met - the same contract 赢丢原因 keeps.
//
// The shared table wants an immutable code; a rival has none (its NAME is what
// people type), so the row's code is its id and is never shown or edited, and
// the shared dialog is replaced by this one (customDialog).

type Open = { mode: "create" } | { mode: "edit"; row: CompetitorRecord };

export function CompetitorConfig({
  rivals,
  usage,
  editable,
  onSave,
  onDelete,
}: {
  readonly rivals: readonly CompetitorRecord[];
  /** How many journal entries and reviews name each rival, by id. */
  readonly usage: Readonly<Record<string, number>>;
  readonly editable: boolean;
  readonly onSave: (input: { id: string | null; name: string; aliases: string[] }) => Promise<VocabularyResult>;
  readonly onDelete: (id: string) => Promise<VocabularyResult>;
}) {
  const { COMPETITION_ERROR, COMPETITOR_TEXT } = useMessages();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<Open | null>(null);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(open.mode === "edit" ? open.row.name : "");
    setAliases(open.mode === "edit" ? open.row.aliases.join(", ") : "");
  }, [open]);

  const rows = rivals.map((r) => ({ ...r, code: r.id }));

  return (
    <>
      <VocabularyConfig
        rows={rows}
        idPrefix="cmp"
        errors={COMPETITION_ERROR}
        editable={editable}
        icon="target"
        text={{
          title: COMPETITOR_TEXT.title,
          noun: COMPETITOR_TEXT.noun,
          why: COMPETITOR_TEXT.why,
          add: COMPETITOR_TEXT.add,
          save: COMPETITOR_TEXT.save,
          codeLabel: COMPETITOR_TEXT.noun,
          codeHint: "",
          nameLabel: COMPETITOR_TEXT.name,
          colName: COMPETITOR_TEXT.colName,
          deleteConsequence: COMPETITOR_TEXT.deleteConsequence,
        }}
        // The default prints the code under the name; a rival's is an id.
        nameSuffix={() => null}
        columns={[
          {
            id: "aliases",
            header: COMPETITOR_TEXT.colAliases,
            cell: (r) =>
              r.aliases.length > 0 ? (
                <span className="text-body-sm">{r.aliases.join(" / ")}</span>
              ) : (
                <span className="text-muted-foreground">-</span>
              ),
          },
          {
            id: "used",
            sortable: true,
            header: COMPETITOR_TEXT.colNamed,
            width: "sm",
            cell: (r) => <span className="tabular-nums">{usage[r.id] ?? 0}</span>,
          },
        ]}
        sortOn={{ used: (r) => usage[r.id] ?? 0 }}
        deletableWhen={(r) => (usage[r.id] ?? 0) === 0}
        extraDefaults={{}}
        extraFromRow={() => ({})}
        customDialog={{
          onAdd: () => setOpen({ mode: "create" }),
          onEdit: (r) => setOpen({ mode: "edit", row: r }),
        }}
        // Never reached: customDialog owns creating and editing.
        onSave={async () => ({ ok: true })}
        onDelete={onDelete}
      />
      <DialogForm
        open={open !== null}
        onOpenChange={(o) => {
          if (!o && !pending) setOpen(null);
        }}
        title={open?.mode === "edit" ? COMPETITOR_TEXT.dialogEdit : COMPETITOR_TEXT.add}
        description={COMPETITOR_TEXT.dialogWhy}
        submitLabel={COMPETITOR_TEXT.save}
        submitting={pending}
        submitDisabled={name.trim() === ""}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() === "" || !open) return;
          start(async () => {
            const r = await onSave({
              id: open.mode === "edit" ? open.row.id : null,
              name: name.trim(),
              aliases: aliases
                .split(/[,、，]/)
                .map((a) => a.trim())
                .filter((a) => a !== ""),
            });
            if (r.ok) {
              setOpen(null);
              router.refresh();
            } else {
              setError(COMPETITION_ERROR[r.error ?? "denied"] ?? COMPETITION_ERROR.denied ?? "");
            }
          });
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel>{COMPETITOR_TEXT.name}</FieldLabel>
            <Input value={name} disabled={pending} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{COMPETITOR_TEXT.colAliases}</FieldLabel>
            <Input value={aliases} disabled={pending} onChange={(e) => setAliases(e.target.value)} />
            <FieldDescription>{COMPETITOR_TEXT.aliasesHint}</FieldDescription>
          </Field>
        </FieldGroup>
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
      </DialogForm>
    </>
  );
}
