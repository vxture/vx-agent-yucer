"use client";
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  Card,
  Checkbox,
  NativeSelect,
} from "@vxture/design-ui";
import { useXiaoyu } from "./xiaoyu-provider";
import { useMessages } from "../lib/i18n/provider";
import { ConfirmDestructive } from "./confirm-destructive";
import {
  readBusinessForm,
  type BusinessForm,
} from "../../domains/copilot/lib/business-form";
import { needsExecutionConfirmation } from "../../domains/copilot/execution-policy";
import type {
  AutonomyMode,
  OperationRisk,
} from "../../domains/copilot/lib/autonomy";
import type { BusinessReceipt } from "../../domains/copilot/execution-domain";
type Step = {
  risk?: OperationRisk;
  id: string;
  draftId: string;
  operation: "save" | "publish";
  status: "pending" | "failed" | "succeeded" | "result_unavailable" | "proposal_unavailable";
  form?: BusinessForm;
};
type Receipt = { id: string; stepId: string; result: BusinessReceipt };
type Grant = {
  id: string;
  stepIds: string[];
  confirmedIds: string[];
  mode: AutonomyMode;
  expiresAt: string;
  revokedAt: string | null;
  remainingActions: number;
};
type State = { canPrepare: boolean; steps: Step[]; receipts: Receipt[]; grants: Grant[] };
type Selection = { ids: string[]; confirmed: boolean };
type ReadError = "unavailable" | "denied";
const emptySelection: Selection = { ids: [], confirmed: false };
function selectable(step: Step) {
  return !!step.form && (step.status === "pending" || step.status === "failed");
}
function readFailure(status: number, code?: string): ReadError {
  return [401, 403, 404].includes(status) || /_SOURCE_(?:CHANGED|UNAVAILABLE)$/.test(code ?? "")
    ? "denied" : "unavailable";
}
type DraftReceipts = ReadonlyMap<string, Receipt>;
type DraftRenderer = { renderDrafts: (saved: DraftReceipts) => ReactNode };
export function XiaoyuExecution({ renderDrafts }: DraftRenderer) {
  const { bundle, recoveryTaskId } = useXiaoyu();
  const taskId = bundle?.task.id ?? recoveryTaskId;
  return taskId ? <ExecutionList key={taskId} renderDrafts={renderDrafts} /> : null;
}
function ExecutionList({ renderDrafts }: DraftRenderer) {
  const { bundle, recoveryTaskId, busy, notesDirty, client } = useXiaoyu(),
    { XIAOYU_EXECUTION: T, XIAOYU_FORMS: F } = useMessages();
  const taskId = bundle?.task.id ?? recoveryTaskId;
  const [data, setData] = useState<State | null>(null),
    [selection, setSelection] = useState<Selection>(emptySelection),
    [mode, setMode] = useState<AutonomyMode>("ask_always"),
    [pending, setPending] = useState(false),
    [readError, setReadError] = useState<ReadError | null>(null),
    [outcome, setOutcome] = useState<"partial" | "unconfirmed" | null>(null),
    [publish, setPublish] = useState<string | null>(null);
  const path = `/api/copilot/tasks/${taskId}/execution`;
  const reading = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);

  const refresh = useCallback(async (autoSelect?: string) => {
    reading.current?.abort();
    const request = new AbortController();
    reading.current = request;
    let failure: ReadError = "unavailable";
    try {
      const response = await fetch(path, { cache: "no-store", signal: request.signal });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        failure = readFailure(response.status, next?.code);
        throw Error("execution_read_failed");
      }
      if (request.signal.aborted) return;
      const state = next as State;
      const eligible = new Set(state.steps.filter(selectable).map((s) => s.id));
      setData(state);
      setReadError(null);
      setSelection((old) => {
        const ids = old.ids.filter((id) => eligible.has(id));
        if (autoSelect && eligible.has(autoSelect) && !ids.includes(autoSelect)) ids.push(autoSelect);
        return ids.length === old.ids.length && ids.every((id, i) => id === old.ids[i])
          ? old : { ids, confirmed: false };
      });
    } catch {
      if (request.signal.aborted) return;
      setData(null);
      setSelection(emptySelection);
      setPublish(null);
      setReadError(failure);
    }
  }, [path]);

  useEffect(() => () => {
    reading.current?.abort();
    writing.current?.abort();
  }, []);
  const refreshOnBundle = useEffectEvent(() => {
    if (!writing.current && !busy) void refresh();
  });
  useEffect(() => {
    // A model turn can create proposals without changing the task ID. The
    // provider also refreshes the current bundle when the tab is visible.
    refreshOnBundle();
  }, [bundle]);

  async function work(action: (post: <T>(input: object) => Promise<T>) => Promise<{
    autoSelect?: string; outcome?: "partial";
  } | void>) {
    if (writing.current || !data || busy) return;
    const request = new AbortController();
    writing.current = request;
    reading.current?.abort();
    setPending(true);
    setOutcome(null);
    let autoSelect: string | undefined;
    try {
      const result = await action(async <T,>(input: object): Promise<T> => {
        request.signal.throwIfAborted();
        const response = await fetch(path, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: request.signal,
        });
        if (!response.ok) throw Error("execution_request_failed");
        const value = await response.json();
        request.signal.throwIfAborted();
        return value as T;
      });
      if (request.signal.aborted) return;
      autoSelect = result?.autoSelect;
      if (result?.outcome) setOutcome(result.outcome);
    } catch {
      if (!request.signal.aborted) setOutcome("unconfirmed");
    } finally {
      if (!request.signal.aborted) {
        // A lost response is reconciled exclusively with a read of persisted
        // receipts. Never resend a write just to learn what happened.
        await refresh(autoSelect);
        if (!request.signal.aborted) setPending(false);
      }
      writing.current = null;
    }
  }
  function prepare(key: string, draftId: string, operation: "save" | "publish") {
    setSelection((old) => ({ ...old, confirmed: false }));
    return work(async (post) => {
      const step = await post<{ id: string }>({ action: "propose", key, draftId, operation });
      return { autoSelect: step.id };
    });
  }
  const drafts = (bundle?.drafts ?? []).filter((d) => d.contractVersion === "business-form/1");
  const steps = data?.steps ?? [];
  const receipts = new Map(data?.receipts.map((r) => [r.stepId, r]));
  const saved = new Map<string, Receipt>();
  for (const step of steps) {
    const receipt = receipts.get(step.id);
    if (receipt && step.operation === "save") saved.set(step.draftId, receipt);
  }
  const forms = (data?.canPrepare ? drafts : []).flatMap((draft) => {
    const form = readBusinessForm(draft.text);
    const proposed = steps.filter((s) => s.draftId === draft.id);
    const save = !proposed.some((s) => s.operation === "save");
    const publish = !!form.targetId && ["strategy", "sales_plan"].includes(form.module) &&
      !proposed.some((s) => s.operation === "publish");
    return save || publish ? [{ draft, form, save, publish }] : [];
  });
  if (!drafts.length && !steps.length && !recoveryTaskId && !outcome) return null;
  const selected = steps.filter((s) => selectable(s) && selection.ids.includes(s.id));
  const confirmed = selection.confirmed && selected.length === selection.ids.length;
  const requiresConfirmation = selected.some((s) =>
    needsExecutionConfirmation(mode, s.risk ?? "destructive"),
  );
  const activeGrant = data?.grants.find((g) =>
    selected.length > 0 &&
    !g.revokedAt &&
    new Date(g.expiresAt) > new Date() &&
    g.remainingActions >= selected.length &&
    selected.every((s) => g.stepIds.includes(s.id) &&
      (!needsExecutionConfirmation(g.mode, s.risk ?? "destructive") || g.confirmedIds.includes(s.id))),
  );
  const hint = readError === "denied" ? T.denied
    : readError ? T.unknown
    : outcome === "partial" ? T.partial
    : outcome === "unconfirmed" ? T.error : null;
  const publishDraft = drafts.find((d) => d.id === publish);
  return (
    <>
      <Card className="gap-sm p-md">
        <div className="flex flex-wrap items-center gap-sm">
          <h3 className="text-label">{T.title}</h3>
          <Button
            className="ml-auto"
            size="md"
            variant="ghost"
            disabled={pending || busy}
            onClick={() => { setOutcome(null); void refresh(); }}
          >
            {T.refresh}
          </Button>
        </div>
        {data ? <p className="text-body-small text-muted-foreground">{T.scope}</p> : null}
        {forms.length ? <div className="space-y-sm">
          {forms.map(({ draft: d, form, save, publish: canPublish }) => (
              <div key={d.id} className="flex flex-wrap items-center gap-sm">
                <span className="min-w-0 flex-1 truncate text-body">
                  {String(form.fields.name ?? F[form.module])}
                </span>
                {save ? (
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={pending || busy}
                    onClick={() => void prepare(d.key, d.id, "save")}
                  >
                    {T.prepare}
                  </Button>
                ) : null}
                {canPublish ? (
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={pending || busy}
                    onClick={() => setPublish(d.id)}
                  >
                    {T.publish}
                  </Button>
                ) : null}
              </div>
          ))}
        </div> : null}
        {steps.length ? (
          <div className="space-y-xs border-t border-border pt-sm">
            {steps.map((step) => {
              const receipt = receipts.get(step.id);
              return (
                <div key={step.id} className="flex flex-wrap items-center gap-sm text-body">
                  <Checkbox
                    checked={selected.some((s) => s.id === step.id)}
                    disabled={pending || busy || !selectable(step)}
                    aria-label={
                      step.form
                        ? String(step.form.fields.name ?? F[step.form.module])
                        : T.pending
                    }
                    onCheckedChange={(checked) => {
                      setSelection((old) => ({
                        ids: checked === true ? [...new Set([...old.ids, step.id])] : old.ids.filter((id) => id !== step.id),
                        confirmed: false,
                      }));
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {step.form
                      ? String(step.form.fields.name ?? F[step.form.module])
                      : step.id.slice(0, 8)}{" "}
                    {"\u00b7"} {step.operation === "save" ? T.save : T.publish}
                  </span>
                  <span className="text-body-small text-muted-foreground">
                    {T[step.status]}
                  </span>
                  {receipt ? (
                    <Button asChild size="md" variant="ghost">
                      <Link href={receipt.result.href}>{T.open}</Link>
                    </Button>
                  ) : null}
                  {receipt ? (
                    <Button
                      size="md"
                      variant="secondary"
                      disabled={pending || busy || notesDirty}
                      onClick={() =>
                        void work(async (post) => {
                          const next = await post<{ taskId: string }>({
                            action: "continue",
                            receiptId: receipt.id,
                          });
                          await client.select(next.taskId);
                        })
                      }
                    >
                      {T.continue}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {selected.length && activeGrant ? (
          <div className="flex flex-wrap gap-sm">
            <Button
              size="md"
              disabled={pending || busy}
              onClick={() =>
                void work(async (post) => {
                  for (const step of selected)
                    await post({ action: "execute", stepId: step.id, grantId: activeGrant.id });
                })
              }
            >
              {T.execute}
            </Button>
            <Button
              size="md"
              variant="ghost"
              disabled={pending || busy}
              onClick={() =>
                void work(async (post) => {
                  await post({ action: "revoke", grantId: activeGrant.id });
                })
              }
            >
              {T.revoke}
            </Button>
          </div>
        ) : null}
        {selected.length && !activeGrant ? (
          <div className="space-y-sm">
            <NativeSelect
              value={mode}
              aria-label={T.mode}
              disabled={pending || busy}
              onChange={(e) => {
                setMode(e.target.value as AutonomyMode);
                setSelection((old) => ({ ...old, confirmed: false }));
              }}
            >
              {(["ask_always", "ask_high_risk", "autonomous"] as const).map((m) => (
                <option key={m} value={m}>{T[m]}</option>
              ))}
            </NativeSelect>
            <label className="flex items-start gap-sm text-body">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(v) => setSelection((old) => ({ ...old, confirmed: v === true }))}
                disabled={pending || busy}
              />
              {T.confirm}
            </label>
            <Button
              size="md"
              disabled={pending || busy || (requiresConfirmation && !confirmed)}
              onClick={() =>
                void work(async (post) => {
                  const ids = selected.map((s) => s.id);
                  const result = await post<{ state: "succeeded" | "partial_or_waiting" }>({
                    action: "grant",
                    stepIds: ids,
                    confirmedIds: confirmed ? ids : [],
                    mode,
                  });
                  if (result.state === "partial_or_waiting") return { outcome: "partial" };
                })
              }
            >
              {T.grant}
            </Button>
          </div>
        ) : null}
        {hint ? (
          <div role="status">
            <Banner tone="warning" title={hint} />
          </div>
        ) : null}
        {publishDraft && data?.canPrepare ? (
          <ConfirmDestructive
            open
            onOpenChange={(open) => {
              if (!open) setPublish(null);
            }}
            verb={T.confirmPublish}
            target={String(readBusinessForm(publishDraft.text).fields.name ?? publishDraft.key)}
            consequence={T.publishing}
            onConfirm={async () => {
              await prepare(publishDraft.key, publishDraft.id, "publish");
              setPublish(null);
            }}
          />
        ) : null}
      </Card>
      {readError === "denied" ? null : renderDrafts(saved)}
    </>
  );
}
