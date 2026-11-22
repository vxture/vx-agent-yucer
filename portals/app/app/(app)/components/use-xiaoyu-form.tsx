"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Banner, Button } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import {
  readBusinessForm,
  mergeFormFields,
  type FormFields,
  type FormModule,
} from "../../domains/copilot/lib/business-form";
import type { TaskBundle } from "../../domains/copilot/task-store";
import { UUID } from "../../domains/copilot/lib/task-contract";
type Binding = { taskId: string; key: string; revision: number };
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function useXiaoyuForm(
  module: FormModule,
  targetId: string | null,
  values: FormFields,
  apply: (fields: FormFields) => void,
) {
  const params = useSearchParams(),
    taskId = params.get("xyTask"),
    key = params.get("xyForm");
  const current = useRef({ values, apply });
  current.current = { values, apply };
  const baseline = useRef<FormFields>({}),
    binding = useRef<Binding | null>(null),
    generation = useRef(0),
    inflight = useRef<Promise<void> | null>(null);
  const [state, setState] = useState<
    "off" | "loading" | "ready" | "dirty" | "error"
  >("off");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const id = ++generation.current;
    binding.current = null;
    if (
      !taskId ||
      !UUID.test(taskId) ||
      !key ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(key)
    ) {
      setState("off");
      return;
    }
    const before = structuredClone(current.current.values),
      abort = new AbortController();
    setState("loading");
    void fetch(`/api/copilot/tasks/${taskId}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return (await r.json()) as TaskBundle;
      })
      .then((b) => {
        if (id !== generation.current) return;
        const row = b.drafts.find(
          (d) => d.key === key && d.contractVersion === "business-form/1",
        );
        if (!row) throw Error();
        const form = readBusinessForm(row.text);
        if (form.module !== module || form.targetId !== targetId) throw Error();
        const patch = Object.fromEntries(
          Object.entries(form.fields).filter(([k]) =>
            equal(current.current.values[k], before[k]),
          ),
        );
        baseline.current = mergeFormFields(before, patch);
        binding.current = { taskId, key, revision: b.task.revision };
        current.current.apply(patch);
        setState("ready");
      })
      .catch(() => {
        if (id === generation.current) setState("error");
      });
    return () => {
      generation.current++;
      binding.current = null;
      abort.abort();
    };
  }, [module, targetId, taskId, key, reload]);
  const sync = useCallback(async () => {
    // Drain edits made while the preceding request was in flight before allowing
    // a model turn to read the private form. Never swallow a failed sync.
    while (inflight.current) await inflight.current;
    const b = binding.current;
    if (!b) {
      if (taskId && key) throw Error("form_sync_failed");
      return;
    }
    const id = generation.current;
    const run = (async () => {
      try {
        for (let round = 0; round < 10; round++) {
          if (id !== generation.current) throw Error();
          const patch = Object.fromEntries(
            Object.entries(current.current.values).filter(
              ([k, v]) => !equal(v, baseline.current[k]),
            ),
          );
          if (!Object.keys(patch).length) {
            setState("ready");
            return;
          }
          const latest = await fetch(`/api/copilot/tasks/${b.taskId}`, {
            cache: "no-store",
          });
          if (!latest.ok) throw Error();
          const content = (await latest.json()) as TaskBundle;
          const r = await fetch(`/api/copilot/tasks/${b.taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "business_form",
              revision: content.task.revision,
              key: b.key,
              fields: patch,
            }),
          });
          if (!r.ok) throw Error();
          const saved = (await r.json()) as TaskBundle;
          if (id !== generation.current) throw Error();
          binding.current = { ...b, revision: saved.task.revision };
          baseline.current = { ...baseline.current, ...patch };
        }
        throw Error();
      } catch {
        if (id === generation.current) setState("error");
        throw Error("form_sync_failed");
      }
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      if (inflight.current === run) inflight.current = null;
    }
  }, [taskId, key]);
  const signature = JSON.stringify(values);
  useEffect(() => {
    if (!binding.current) return;
    if (Object.entries(values).every(([k, v]) => equal(v, baseline.current[k])))
      return;
    setState("dirty");
    const timer = setTimeout(() => {
      void sync().catch(() => {});
    }, 750);
    return () => clearTimeout(timer);
  }, [signature, sync]);
  useEffect(() => {
    const before = (event: Event) => {
      (event as CustomEvent<Promise<void>[]>).detail.push(sync());
    };
    const refresh = () => setReload((n) => n + 1);
    window.addEventListener("xiaoyu:sync-forms", before);
    window.addEventListener("xiaoyu:refresh-forms", refresh);
    return () => {
      window.removeEventListener("xiaoyu:sync-forms", before);
      window.removeEventListener("xiaoyu:refresh-forms", refresh);
    };
  }, [sync]);
  return { state, sync, retry: () => setReload((n) => n + 1) };
}
export function XiaoyuFormNotice({
  binding,
}: {
  binding: ReturnType<typeof useXiaoyuForm>;
}) {
  const { XIAOYU_FORMS: T } = useMessages();
  if (binding.state === "off") return null;
  return (
    <div className="mb-md">
      <Banner
        tone={binding.state === "error" ? "warning" : "info"}
        title={
          binding.state === "error"
            ? T.unavailable
            : binding.state === "dirty"
              ? T.syncing
              : T.notSaved
        }
      />
      {binding.state === "error" ? (
        <Button size="md" variant="secondary" onClick={binding.retry}>
          {T.retry}
        </Button>
      ) : null}
    </div>
  );
}
