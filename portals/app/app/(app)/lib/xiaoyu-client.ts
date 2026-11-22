import type { TaskBundle, TaskRecord } from "../../domains/copilot/task-store";
import { UUID, type TaskObject } from "../../domains/copilot/lib/task-contract";

export type TaskView = TaskBundle & {
  currentRuleVersion: string;
  ruleChanged: boolean;
  recovery: { interruptedRequests: string[] };
};
export interface XiaoyuState {
  tasks: TaskRecord[];
  bundle: TaskView | null;
  input: string;
  notes: string;
  notesDirty: boolean;
  busy: boolean;
  loading: boolean;
  error: string | null;
  pending: { requestId: string; question: string; revision: number } | null;
  creation: { requestId: string; question: string } | null;
}
type Transport = (input: string, init?: RequestInit) => Promise<Response>;
export const pointerKey = (workspace: string, actor: string) =>
  `yucer:xiaoyu:task:${workspace}:${actor}`;
export function pageObject(path: string): TaskObject | null {
  const [module, id] = path.split("/").filter(Boolean);
  if (!id || !UUID.test(id)) return null;
  const kinds: Record<string, TaskObject["kind"]> = {
    account: "account", named: "account", pipeline: "opportunity", lead: "lead",
    strategy: "strategy", segment: "segment", catalog: "product", solution: "solution",
    campaign: "campaign", delivery: "project",
  };
  return kinds[module] ? { kind: kinds[module], id } : null;
}
export const workspaceHref = (id?: string) => id ? `/copilot?task=${encodeURIComponent(id)}` : "/copilot";
class RequestFailure extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
class StaleRequest extends Error {}
const revoked = (e: unknown) => e instanceof RequestFailure && (
  e.status === 401 || e.status === 403 || e.status === 404 || /SOURCE_CHANGED/.test(e.code)
);

// One owner/workspace controller survives route transitions and surface changes.
// Only an opaque task pointer may enter sessionStorage, never private content.
export class XiaoyuClient {
  private state: XiaoyuState = {
    tasks: [], bundle: null, input: "", notes: "", notesDirty: false,
    busy: false, loading: true, error: null, pending: null, creation: null,
  };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private lifetime = 0;
  private active = false;
  private selectedId: string | null = null;
  private abort = new AbortController();
  constructor(
    private readonly transport: Transport,
    private readonly remember: (id: string | null) => void,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<XiaoyuState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const lifetime = this.lifetime;
    try {
      const response = await this.transport(`/api/copilot/tasks${path}`, {
        method, cache: "no-store", credentials: "same-origin", signal: this.abort.signal,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      if (!this.active || lifetime !== this.lifetime) throw new StaleRequest();
      if (!response.ok) throw new RequestFailure(typeof result.code === "string" ? result.code : "COPILOT_TASK_UNAVAILABLE", response.status);
      return result as T;
    } catch (error) {
      if (!this.active || lifetime !== this.lifetime) throw new StaleRequest();
      throw error;
    }
  }
  private fail(error: unknown, clear = revoked(error)) {
    if (error instanceof StaleRequest || !this.active) return;
    const code = error instanceof RequestFailure ? error.code : "COPILOT_TASK_UNAVAILABLE";
    if (clear) {
      this.generation++;
      this.selectedId = null;
      this.remember(null);
    }
    this.update({ error: code, ...(clear ? { tasks: [], bundle: null, notes: "", input: "", notesDirty: false, pending: null, creation: null, loading: false } : {}) });
  }
  private accept(bundle: TaskView, preserveNotes = false) {
    this.selectedId = bundle.task.id;
    this.remember(bundle.task.id);
    this.update({ bundle, error: null, ...(preserveNotes && this.state.notesDirty ? {} : {
      notes: bundle.drafts.find(d => d.key === "notes")?.text ?? "", notesDirty: false,
    }) });
    if (this.state.pending && bundle.turns.some(t => t.requestId === this.state.pending?.requestId && t.status === "succeeded")) {
      this.update({ pending: null });
    }
  }
  setInput = (input: string) => this.update({ input });
  setNotes = (notes: string) => this.update({ notes, notesDirty: true });
  async start(id: string | null) {
    this.active = true;
    this.abort = new AbortController();
    this.update({ loading: true, busy: false });
    const generation = this.generation;
    await this.refreshList();
    if (!this.active || generation !== this.generation) return;
    if (id && UUID.test(id)) await this.select(id);
    else this.update({ loading: false });
  }
  async refreshList() {
    const generation = this.generation;
    try {
      const tasks = await this.request<TaskRecord[]>("");
      if (generation === this.generation) this.update({ tasks });
    } catch (error) { if (generation === this.generation) this.fail(error); }
  }
  async select(id: string) {
    if (!UUID.test(id) || this.state.busy || this.state.notesDirty) return;
    const generation = ++this.generation;
    this.selectedId = id;
    this.update({ bundle: null, notes: "", input: "", pending: null, creation: null, loading: true, error: null });
    try {
      const bundle = await this.request<TaskView>(`/${id}`);
      if (generation === this.generation) this.accept(bundle);
    } catch (error) { if (generation === this.generation) this.fail(error, true); }
    finally { if (this.active && generation === this.generation) this.update({ loading: false }); }
  }
  newTask = () => {
    if (this.state.busy || this.state.notesDirty) return;
    this.generation++;
    this.selectedId = null;
    this.remember(null);
    this.update({ bundle: null, input: "", notes: "", notesDirty: false, error: null, pending: null, creation: null, loading: false });
  };
  // Refresh is read-only: an orphan request is never automatically replayed.
  async refresh(includeList = true) {
    if (this.state.busy || this.state.loading) return;
    const id = this.selectedId, generation = this.generation;
    try {
      const bundle = id ? await this.request<TaskView>(`/${id}`) : null;
      if (generation !== this.generation) return;
      if (bundle) this.accept(bundle, true);
      if (includeList) await this.refreshList();
    } catch (error) { if (generation === this.generation) this.fail(error, !!id); }
  }
  async change(action: Record<string, unknown>) {
    const bundle = this.state.bundle;
    if (!bundle || this.state.busy) return;
    this.update({ busy: true, error: null });
    const lifetime = this.lifetime;
    try {
      const next = await this.request<TaskView>(`/${bundle.task.id}`, "PATCH", { ...action, revision: bundle.task.revision });
      this.accept(next);
      await this.refreshList();
    } catch (error) { this.fail(error); }
    finally { if (lifetime === this.lifetime) this.update({ busy: false }); }
  }
  saveNotes = () => this.change({ action: "notes", key: "notes", text: this.state.notes, contractVersion: "private-notes/1" });
  async send() {
    if (this.state.busy || this.state.loading || this.state.pending || this.state.notesDirty || !this.state.input.trim()) return;
    const question = this.state.creation?.question ?? this.state.input.trim();
    this.update({ busy: true, error: null });
    const lifetime = this.lifetime;
    try {
      let task = this.state.bundle?.task;
      if (!task) {
        const creation = this.state.creation ?? { requestId: crypto.randomUUID(), question };
        this.update({ creation });
        task = await this.request<TaskRecord>("", "POST", { requestId: creation.requestId, goal: question.slice(0, 1000), targets: [] });
        this.selectedId = task.id;
        this.remember(task.id);
        this.update({ creation: null });
        this.accept(await this.request<TaskView>(`/${task.id}`));
      }
      const pending = { requestId: crypto.randomUUID(), question, revision: task.revision };
      this.update({ pending, input: "" });
      await this.request(`/${task.id}/turn`, "POST", pending);
      this.update({ pending: null });
    } catch (error) { this.fail(error); }
    finally {
      if (lifetime === this.lifetime && this.active) {
        this.update({ busy: false, loading: false });
        await this.refresh();
      }
    }
  }
  // Explicit recovery checks the receipt. Missing receipts replay the SAME
  // idempotency key; a terminal failure only restores text for a new decision.
  async continueAfterFailure() {
    if (this.state.busy || !this.state.pending || !this.state.bundle) return;
    await this.refresh();
    const pending = this.state.pending, task = this.state.bundle?.task;
    if (!pending || !task) return;
    const turn = this.state.bundle?.turns.find(t => t.requestId === pending.requestId);
    if (turn?.status === "running") return;
    if (turn) { this.update({ pending: null, input: pending.question, error: null }); return; }
    const replay = { ...pending, revision: task.revision };
    this.update({ busy: true, error: null, pending: replay });
    const lifetime = this.lifetime;
    try {
      await this.request(`/${task.id}/turn`, "POST", replay);
      this.update({ pending: null });
    } catch (error) { this.fail(error); }
    finally {
      if (lifetime === this.lifetime && this.active) { this.update({ busy: false }); await this.refresh(); }
    }
  }
  suspend() {
    this.active = false;
    this.lifetime++;
    this.generation++;
    this.abort.abort();
  }
}
