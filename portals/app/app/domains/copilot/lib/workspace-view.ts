import type { TaskBundle } from "../task-store";
import { readBusinessForm, type FormModule } from "./business-form";

export type WorkspaceKind = "conversation" | "research" | "form" | "judgement";
export type WorkspacePanel = "context" | "overview" | "forms" | "sources" | "activity";
export type WorkspaceStage = "awaiting" | "running" | "paused" | "completed" | "cancelled" | "interrupted" | "failed";
export interface WorkspaceView {
  version: "task-workspace/1";
  kind: WorkspaceKind;
  stage: WorkspaceStage;
  modules: FormModule[];
  panels: WorkspacePanel[];
  overviewMessageId: string | null;
  invalidDrafts: number;
}

/** A display projection of authorized records, never an agent-supplied layout
 * or proof of a business write. Execution remains bound to persisted receipts. */
export function taskWorkspaceView(bundle: TaskBundle | null): WorkspaceView {
  const forms = (bundle?.drafts ?? []).filter(d => d.contractVersion === "business-form/1");
  const modules: FormModule[] = [];
  let invalidDrafts = 0;
  for (const draft of forms) {
    try { const module = readBusinessForm(draft.text).module; if (!modules.includes(module)) modules.push(module); }
    catch { invalidDrafts++; }
  }
  const turns = bundle?.turns ?? [], last = turns.at(-1);
  const research = turns.some(t => t.status === "succeeded" && !t.artifacts?.failure && !!t.artifacts?.research.length);
  const kind: WorkspaceKind = forms.length ? "form" : research ? "research" : bundle?.references.some(r => r.kind === "judgement") ? "judgement" : "conversation";
  const status = bundle?.task.status;
  const stage: WorkspaceStage = status && status !== "active" ? status : last?.status === "running" ? "running"
    : last?.status === "failed" ? "failed" : last?.status === "interrupted" ? "interrupted" : "awaiting";
  const overviewMessageId = bundle?.messages.findLast(m => m.role === "assistant")?.id ?? null;
  const panels: WorkspacePanel[] = [];
  // A saved task can have notes, input and references before its first answer.
  // Restoring it must not present the same blank board as a new conversation.
  if (bundle && !forms.length && !overviewMessageId) panels.push("context");
  if (kind === "form") panels.push("forms");
  if (overviewMessageId) panels.push("overview");
  // The execution reader may restore receipts even when no editable draft is
  // present. It makes its own fresh authorization and result-state checks.
  if (kind !== "form" && bundle) panels.push("forms");
  if (turns.length || (status && status !== "active")) panels.push("activity");
  if (turns.some(t => !!t.artifacts && ["succeeded", "failed"].includes(t.status))) panels.push("sources");
  return { version:"task-workspace/1", kind, stage, modules, panels, overviewMessageId, invalidDrafts };
}
