"use client";
import { useEffect, useState } from "react";
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
  status: "pending" | "failed" | "succeeded" | "result_unavailable";
  form?: BusinessForm;
};
type Receipt = { id: string; stepId: string; result: BusinessReceipt };
type Grant = {
  id: string;
  stepIds: string[];
  expiresAt: string;
  revokedAt: string | null;
};
type State = { steps: Step[]; receipts: Receipt[]; grants: Grant[] };
export function XiaoyuExecution() {
  const { bundle, recoveryTaskId } = useXiaoyu();
  const taskId = bundle?.task.id ?? recoveryTaskId;
  return taskId ? <ExecutionList key={taskId} /> : null;
}
function ExecutionList() {
  const { bundle, recoveryTaskId, busy, client } = useXiaoyu(),
    { XIAOYU_EXECUTION: T, XIAOYU_FORMS: F } = useMessages();
  const taskId = bundle?.task.id ?? recoveryTaskId;
  const [data, setData] = useState<State>({
      steps: [],
      receipts: [],
      grants: [],
    }),
    [selected, setSelected] = useState<string[]>([]),
    [mode, setMode] = useState<AutonomyMode>("ask_always"),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(false),
    [publish, setPublish] = useState<string | null>(null);
  const path = `/api/copilot/tasks/${taskId}/execution`;
  async function request(input?: unknown) {
    const response = await fetch(path, {
      method: input ? "POST" : "GET",
      cache: "no-store",
      headers: input ? { "Content-Type": "application/json" } : undefined,
      body: input ? JSON.stringify(input) : undefined,
    });
    if (!response.ok) {
      setData({ steps: [], receipts: [], grants: [] });
      setSelected([]);
      throw Error("execution_failed");
    }
    return response.json();
  }
  async function refresh() {
    setData(await request());
  }
  useEffect(() => {
    setData({ steps: [], receipts: [], grants: [] });
    setSelected([]);
    setConfirmed(false);
    setError(false);
    if (!taskId) return;
    const abort = new AbortController();
    void fetch(path, { cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        if (r.ok) setData(await r.json());
        else { setData({ steps: [], receipts: [], grants: [] }); setSelected([]); }
      })
      .catch(() => {});
    return () => abort.abort();
  }, [taskId, path]);
  async function work(action: () => Promise<void>) {
    setPending(true);
    setError(false);
    try {
      await action();
      await refresh();
    } catch {
      setError(true);
      try {
        await refresh();
      } catch {
        /* Keep known receipt; never claim an unknown commit failed. */
      }
    } finally {
      setPending(false);
    }
  }
  async function prepare(
    key: string,
    draftId: string,
    operation: "save" | "publish",
  ) {
    await work(async () => {
      const step = await request({
        action: "propose",
        key,
        draftId,
        operation,
      });
      setSelected((old) => [...new Set([...old, step.id])]);
      setConfirmed(false);
    });
  }
  if (!taskId) return null;
  const forms = (bundle?.drafts ?? []).filter(
    (d) => d.contractVersion === "business-form/1",
  );
  if (!forms.length && !data.steps.length) return null;
  const requiresConfirmation = data.steps.some(
    (s) =>
      selected.includes(s.id) &&
      needsExecutionConfirmation(mode, s.risk ?? "destructive"),
  );
  const activeGrant = data.grants.find(
    (g) =>
      selected.length > 0 &&
      !g.revokedAt &&
      new Date(g.expiresAt) > new Date() &&
      selected.every((id) => g.stepIds.includes(id)),
  );
  return (
    <Card className="p-md">
      <div className="flex flex-wrap items-center gap-sm">
        <h3 className="text-label">{T.title}</h3>
        <Button
          className="ml-auto"
          size="md"
          variant="ghost"
          disabled={pending}
          onClick={() => void work(refresh)}
        >
          {T.refresh}
        </Button>
      </div>
      <p className="mt-sm text-body-small text-muted-foreground">{T.scope}</p>
      <div className="mt-md space-y-sm">
        {forms.map((d) => {
          const form = readBusinessForm(d.text);
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-sm">
              <span className="min-w-0 flex-1 truncate text-body">
                {String(form.fields.name ?? F[form.module])}
              </span>
              <Button
                size="md"
                variant="secondary"
                disabled={pending || busy}
                onClick={() => void prepare(d.key, d.id, "save")}
              >
                {T.prepare}
              </Button>
              {form.targetId &&
              ["strategy", "sales_plan"].includes(form.module) ? (
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
          );
        })}
      </div>
      {data.steps.length ? (
        <div className="mt-md space-y-sm border-t border-border pt-md">
          {data.steps.map((step) => {
            const receipt = data.receipts.find((r) => r.stepId === step.id);
            return (
              <div key={step.id} className="flex flex-wrap items-center gap-sm text-body">
                <Checkbox
                  checked={selected.includes(step.id)}
                  disabled={
                    pending ||
                    !["pending", "failed"].includes(step.status) ||
                    !step.form
                  }
                  aria-label={
                    step.form
                      ? String(step.form.fields.name ?? F[step.form.module])
                      : T.pending
                  }
                  onCheckedChange={(checked) => {
                    setSelected((old) =>
                      checked
                        ? [...old, step.id]
                        : old.filter((id) => id !== step.id),
                    );
                    setConfirmed(false);
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
                    disabled={pending}
                    onClick={() =>
                      void work(async () => {
                        const next = await request({
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
      {selected.length ? (
        <div className="mt-md space-y-sm">
          <NativeSelect
            value={mode}
            aria-label={T.mode}
            disabled={pending}
            onChange={(e) => {
              setMode(e.target.value as AutonomyMode);
              setConfirmed(false);
            }}
          >
            {(["ask_always", "ask_high_risk", "autonomous"] as const).map(
              (m) => (
                <option key={m} value={m}>
                  {T[m]}
                </option>
              ),
            )}
          </NativeSelect>
          <label className="flex items-start gap-sm text-body">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              disabled={pending}
            />
            {T.confirm}
          </label>
          <div className="flex flex-wrap gap-sm">
            <Button
              size="md"
              disabled={pending || busy || (requiresConfirmation && !confirmed)}
              onClick={() =>
                void work(async () => {
                  await request({
                    action: "grant",
                    stepIds: selected,
                    confirmedIds: confirmed ? selected : [],
                    mode,
                  });
                })
              }
            >
              {T.grant}
            </Button>
            <Button
              size="md"
              variant="secondary"
              disabled={pending || busy || !activeGrant}
              onClick={() =>
                void work(async () => {
                  for (const stepId of selected) {
                    await request({
                      action: "execute",
                      stepId,
                      grantId: activeGrant!.id,
                    });
                    await refresh();
                  }
                })
              }
            >
              {T.execute}
            </Button>
            {activeGrant ? (
              <Button
                size="md"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  void work(async () => {
                    await request({
                      action: "revoke",
                      grantId: activeGrant.id,
                    });
                  })
                }
              >
                {T.revoke}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="mt-md">
          <Banner tone="warning" title={T.error} description={T.partial} />
        </div>
      ) : null}
      <p className="mt-sm text-body-small text-muted-foreground">{T.resume}</p>
      {publish ? (
        <ConfirmDestructive
          open
          onOpenChange={(open) => {
            if (!open) setPublish(null);
          }}
          verb={T.confirmPublish}
          target={forms.find((d) => d.id === publish)?.key ?? ""}
          consequence={T.publishing}
          onConfirm={async () => {
            const d = forms.find((row) => row.id === publish);
            if (d) await prepare(d.key, d.id, "publish");
            setPublish(null);
          }}
        />
      ) : null}
    </Card>
  );
}
