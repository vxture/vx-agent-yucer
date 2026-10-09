"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Checkbox,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  StatusBadge,
  Textarea,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { DialogForm } from "./dialog-form";
import { PanelSub } from "./deal-panels";
import { RowActions } from "./table-fittings";
import { Tag } from "./tag";
import { LIGHT_BUTTON } from "./action-card";

// 竞争位置 (incr/0094, deal batch 7b) - the deal page's record of who we are up
// against and how the buyer decides. Two blocks under the dimension's
// indicator rows:
//
//   对手      one row per rival still in the running (现有供应商 marked, the
//             historical win rate against it, or 样本不足); 添加对手 / 只有我们;
//             each row's menu: 标记出局, 设为 / 取消现有供应商.
//   决策标准  one row per criterion: the statement, who shaped it, how we fit.
//
// Every write is a server action that re-runs pipeline.competition.record.
// Rival mentions in the follow-ups stay below (the page renders them).

export interface CompetitionRivalRow {
  readonly competitorId: string;
  readonly name: string;
  readonly isIncumbent: boolean;
  readonly winRate: { readonly won: number; readonly decided: number; readonly rate: number | null } | null;
}

export interface CompetitionCriterionRow {
  readonly id: string;
  readonly statement: string;
  readonly shapedBy: string;
  readonly fit: string | null;
  readonly fitNote: string | null;
}

type Result = { ok: boolean; error?: string };

export function CompetitionPanel({
  opportunityId,
  rivals,
  outNames,
  onlyUs,
  criteria,
  knownNames,
  canRecord,
  onRecord,
  onSaveCriterion,
  onRemoveCriterion,
}: {
  readonly opportunityId: string;
  readonly rivals: readonly CompetitionRivalRow[];
  readonly outNames: readonly string[];
  readonly onlyUs: boolean;
  readonly criteria: readonly CompetitionCriterionRow[];
  /** The workspace's rivals, offered as the name box's suggestions. */
  readonly knownNames: readonly string[];
  readonly canRecord: boolean;
  readonly onRecord: (
    opportunityId: string,
    input: { competitorId?: string | null; competitorName?: string; isIncumbent?: boolean; present?: boolean },
  ) => Promise<Result>;
  readonly onSaveCriterion: (
    opportunityId: string,
    input: { id?: string | null; statement: string; shapedBy?: string; fit?: string | null; fitNote?: string | null },
  ) => Promise<Result>;
  readonly onRemoveCriterion: (opportunityId: string, id: string) => Promise<Result>;
}) {
  const { COMPETITION_TEXT: T, COMPETITION_ERROR, DS_LABELS } = useMessages();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [incumbent, setIncumbent] = useState(false);
  const [editing, setEditing] = useState<CompetitionCriterionRow | "new" | null>(null);
  const [draft, setDraft] = useState({ statement: "", shapedBy: "unknown", fit: "", fitNote: "" });

  const run = (p: Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await p;
      if (!r.ok) {
        setError(COMPETITION_ERROR[r.error ?? "denied"] ?? COMPETITION_ERROR.denied);
        return;
      }
      setError(null);
      after?.();
    });

  const openCriterion = (row: CompetitionCriterionRow | "new") => {
    setEditing(row);
    setDraft(
      row === "new"
        ? { statement: "", shapedBy: "unknown", fit: "", fitNote: "" }
        : { statement: row.statement, shapedBy: row.shapedBy, fit: row.fit ?? "", fitNote: row.fitNote ?? "" },
    );
  };

  const rate = (w: CompetitionRivalRow["winRate"]) =>
    !w || w.rate === null ? T.winRateThin(w?.decided ?? 0) : T.winRate(Math.round(w.rate * 100), w.decided);

  return (
    <div className="flex flex-col">
      {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

      <PanelSub
        action={
          canRecord ? (
            <span className="flex items-center gap-2xs">
              {rivals.length === 0 && !onlyUs ? (
                <Button variant="ghost" size="sm" className={LIGHT_BUTTON} disabled={pending} onClick={() => run(onRecord(opportunityId, { competitorId: null }))}>
                  {T.onlyUs}
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" className={LIGHT_BUTTON} disabled={pending} onClick={() => { setName(""); setIncumbent(false); setAdding(true); }}>
                {T.addRival}
              </Button>
            </span>
          ) : undefined
        }
      >
        {T.rivalsTitle}
      </PanelSub>
      {rivals.length === 0 ? (
        <p className="text-muted-foreground py-xs text-body-small">{onlyUs ? T.onlyUsState : T.noRivals}</p>
      ) : (
        <ol className="flex flex-col">
          {rivals.map((r) => (
            <li
              key={r.competitorId}
              className="border-border grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-sm border-b border-dashed py-xs text-body-small last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-xs">
                <span className="text-foreground truncate font-medium">{r.name}</span>
                {r.isIncumbent ? <Tag tone="warning">{T.incumbent}</Tag> : null}
              </span>
              <span className="text-muted-foreground tabular-nums">{rate(r.winRate)}</span>
              <RowActions
                label={DS_LABELS.actionMenu}
                disabled={pending}
                items={
                  canRecord
                    ? [
                        {
                          id: "incumbent",
                          label: r.isIncumbent ? T.unsetIncumbent : T.setIncumbent,
                          onSelect: () => run(onRecord(opportunityId, { competitorId: r.competitorId, isIncumbent: !r.isIncumbent })),
                        },
                        {
                          id: "out",
                          label: T.markOut,
                          onSelect: () => run(onRecord(opportunityId, { competitorId: r.competitorId, isIncumbent: r.isIncumbent, present: false })),
                        },
                      ]
                    : []
                }
              />
            </li>
          ))}
        </ol>
      )}
      {outNames.length > 0 ? <p className="text-muted-foreground pt-2xs text-body-small">{T.outList(outNames.join(T.sep))}</p> : null}

      <PanelSub
        action={
          canRecord ? (
            <Button variant="ghost" size="sm" className={LIGHT_BUTTON} disabled={pending} onClick={() => openCriterion("new")}>
              {T.addCriterion}
            </Button>
          ) : undefined
        }
      >
        {T.criteriaTitle}
      </PanelSub>
      {criteria.length === 0 ? (
        <p className="text-muted-foreground py-xs text-body-small">{T.noCriteria}</p>
      ) : (
        <ol className="flex flex-col">
          {criteria.map((c) => (
            <li
              key={c.id}
              className="border-border grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-sm border-b border-dashed py-xs text-body-small last:border-b-0"
            >
              <span className="min-w-0">
                <span className="text-foreground">{c.statement}</span>
                {c.fitNote ? <span className="text-muted-foreground"> · {c.fitNote}</span> : null}
              </span>
              <Tag tone={c.shapedBy === "us" ? "success" : "neutral"}>{T.shapedBy[c.shapedBy] ?? c.shapedBy}</Tag>
              <Tag tone={c.fit === "met" ? "success" : c.fit === "partial" ? "warning" : c.fit === "unmet" ? "danger" : "neutral"}>
                {c.fit ? (T.fit[c.fit] ?? c.fit) : T.fitNone}
              </Tag>
              <RowActions
                label={DS_LABELS.actionMenu}
                disabled={pending}
                items={
                  canRecord
                    ? [
                        { id: "edit", label: T.editCriterion, icon: "edit", onSelect: () => openCriterion(c) },
                        {
                          id: "remove",
                          label: T.removeCriterion,
                          separatorBefore: true,
                          onSelect: () => run(onRemoveCriterion(opportunityId, c.id)),
                        },
                      ]
                    : []
                }
              />
            </li>
          ))}
        </ol>
      )}

      {adding ? (
        <DialogForm
          open
          onOpenChange={(o: boolean) => {
            if (!o) setAdding(false);
          }}
          title={T.addRival}
          submitLabel={T.save}
          submitting={pending}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() === "") return;
            run(onRecord(opportunityId, { competitorName: name, isIncumbent: incumbent }), () => setAdding(false));
          }}
        >
          <Field>
            <FieldLabel htmlFor="rival-name">{T.rivalName}</FieldLabel>
            <Input id="rival-name" list="rival-known" value={name} placeholder={T.rivalNameHint} onChange={(e) => setName(e.target.value)} />
            <datalist id="rival-known">
              {knownNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="rival-incumbent" checked={incumbent} onCheckedChange={(v) => setIncumbent(v === true)} />
            <FieldLabel htmlFor="rival-incumbent">{T.incumbentAsk}</FieldLabel>
          </Field>
        </DialogForm>
      ) : null}

      {editing ? (
        <DialogForm
          open
          onOpenChange={(o: boolean) => {
            if (!o) setEditing(null);
          }}
          title={editing === "new" ? T.addCriterion : T.editCriterion}
          submitLabel={T.save}
          submitting={pending}
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.statement.trim() === "") return;
            run(
              onSaveCriterion(opportunityId, {
                id: editing === "new" ? null : editing.id,
                statement: draft.statement,
                shapedBy: draft.shapedBy,
                fit: draft.fit || null,
                fitNote: draft.fitNote,
              }),
              () => setEditing(null),
            );
          }}
        >
          <Field>
            <FieldLabel htmlFor="crit-statement">{T.criterionStatement}</FieldLabel>
            <Textarea id="crit-statement" value={draft.statement} placeholder={T.criterionHint} onChange={(e) => setDraft({ ...draft, statement: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="crit-shaped">{T.shapedByLabel}</FieldLabel>
            <NativeSelect id="crit-shaped" value={draft.shapedBy} onChange={(e) => setDraft({ ...draft, shapedBy: e.target.value })}>
              {(["us", "buyer", "rfp", "unknown"] as const).map((k) => (
                <option key={k} value={k}>
                  {T.shapedBy[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="crit-fit">{T.fitLabel}</FieldLabel>
            <NativeSelect id="crit-fit" value={draft.fit} onChange={(e) => setDraft({ ...draft, fit: e.target.value })}>
              <option value="">{T.fitNone}</option>
              {(["met", "partial", "unmet"] as const).map((k) => (
                <option key={k} value={k}>
                  {T.fit[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="crit-note">{T.fitNoteLabel}</FieldLabel>
            <Input id="crit-note" value={draft.fitNote} maxLength={255} onChange={(e) => setDraft({ ...draft, fitNote: e.target.value })} />
          </Field>
        </DialogForm>
      ) : null}
    </div>
  );
}
