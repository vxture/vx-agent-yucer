import type { TaskBundle, TaskRecord } from "../../domains/copilot/task-store";
import { UUID, type TaskObject } from "../../domains/copilot/lib/task-contract";
import { COMPOSER_DRAFT_KEY, validPageFilter, type TaskFocus, type TaskPageContext } from "../../domains/copilot/lib/page-context";

export type TaskView = TaskBundle & {
  currentRuleVersion: string;
  ruleChanged: boolean;
  recovery: { interruptedRequests: string[] };
};
export interface XiaoyuState {
  tasks: TaskRecord[];
  bundle: TaskView | null;
  recoveryTaskId: string | null;
  input: string;
  inputDirty: boolean;
  inputSaving: boolean;
  pageContext: TaskPageContext | null;
  focus: TaskFocus;
  notes: string;
  notesDirty: boolean;
  busy: boolean;
  loading: boolean;
  error: string | null;
  pending: { requestId: string; question: string; revision: number; pageContext?: TaskPageContext; focus?: TaskFocus } | null;
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
  e.status === 401 || e.status === 403 || e.status === 404 || /(?:source_changed|source_unavailable)/i.test(e.code)
);
function savedInput(bundle: TaskView): string {
  const draft = bundle.drafts.find(d => d.key === COMPOSER_DRAFT_KEY && d.contractVersion === "private-notes/1");
  const sent = bundle.messages.findLast(m => m.role === "user");
  return draft && (!sent || new Date(draft.createdAt).getTime() > new Date(sent.createdAt).getTime()) ? draft.text : "";
}

// One owner/workspace controller survives route transitions and surface changes.
// Only an opaque task pointer may enter sessionStorage, never private content.
export class XiaoyuClient {
  private state: XiaoyuState = {
    tasks: [], bundle: null, recoveryTaskId: null, input: "", inputDirty: false, inputSaving: false, pageContext: null, focus: { mode: "auto" }, notes: "", notesDirty: false,
    busy: false, loading: true, error: null, pending: null, creation: null,
  };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private lifetime = 0;
  private active = false;
  private selectedId: string | null = null;
  private abort = new AbortController();
  private readonly inputs = new Map<string, string>();
  private inputWrite: Promise<boolean> | null = null;
  private formContext: (NonNullable<TaskPageContext["form"]> & { targetId: string | null }) | null = null;
  constructor(
    private readonly transport: Transport,
    private readonly remember: (id: string | null) => void,
    private readonly navigation?: {sync:()=>Promise<void>;open:(href:string)=>void},
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
    const recoveryTaskId = clear && error instanceof RequestFailure &&
      /^(?:COPILOT_TASK_)?SOURCE_CHANGED$/i.test(error.code) ? this.selectedId : null;
    if (clear) {
      this.inputs.clear();
      this.generation++;
      this.selectedId = null;
      this.remember(recoveryTaskId);
    }
    this.update({ error: code, ...(clear ? { tasks: [], bundle: null, recoveryTaskId, notes: "", input: "", inputDirty: false, focus: { mode: "auto" }, notesDirty: false, pending: null, creation: null, loading: false } : {}) });
  }
  private accept(bundle: TaskView, preserveNotes = false, restoreInput = false) {
    this.selectedId = bundle.task.id;
    this.remember(bundle.task.id);
    const stored = savedInput(bundle);
    const input = restoreInput ? this.inputs.get(bundle.task.id) ?? stored : this.state.input;
    this.update({ bundle, recoveryTaskId: null, error: null, input, inputDirty: input !== stored, ...(preserveNotes && this.state.notesDirty ? {} : {
      notes: bundle.drafts.find(d => d.key === "notes")?.text ?? "", notesDirty: false,
    }) });
    if (this.state.pending && bundle.turns.some(t => t.requestId === this.state.pending?.requestId && t.status === "succeeded")) {
      this.update({ pending: null });
    }
  }
  setInput = (input: string) => {
    if (!this.active) return;
    this.inputs.set(this.selectedId ?? "new", input);
    this.update({ input, inputDirty: input !== (this.state.bundle ? savedInput(this.state.bundle) : "") });
  };
  private pageListing: { surface:string; filters:Record<string,string>; selection:TaskObject[] } | null = null;
  private routeContext: TaskPageContext | null = null;
  setPageListing = (surface:string, listing:{filters:Record<string,string>;selection:TaskObject[]}|null) => {
    if(!listing && this.pageListing?.surface!==surface)return;
    this.pageListing=listing?{surface,filters:Object.fromEntries(Object.entries(listing.filters).filter(([k,v])=>v && validPageFilter(k,v))),selection:listing.selection.slice(0,20)}:null;
    this.setPageContext(this.routeContext);
  };
  setPageContext = (pageContext: TaskPageContext | null) => {
    this.routeContext = pageContext;
    if(pageContext && this.pageListing && pageContext.surface===this.pageListing.surface)pageContext={...pageContext,filters:{...pageContext.filters,...this.pageListing.filters},selection:this.pageListing.selection};
    const form = this.formContext;
    if (pageContext && form && ((form.module === "sales_plan" ? "planning" : form.module) === pageContext.module || pageContext.module === "copilot")) {
      const { targetId, ...metadata } = form;
      const object = targetId && UUID.test(targetId) ? {kind:form.module as TaskObject["kind"],id:targetId} : null;
      pageContext = { ...pageContext, form: metadata, ...(object ? pageContext.module === "copilot" ? {selection:[object]} : {object} : {}) };
    }
    if (JSON.stringify(pageContext) !== JSON.stringify(this.state.pageContext)) this.update({ pageContext });
  };
  setFormContext = (form: XiaoyuClient["formContext"]) => {
    this.formContext = form;
    const page = this.state.pageContext;
    if (page) { const { form: _previous, ...route } = page; this.setPageContext(route); }
  };
  setFocus = (focus: TaskFocus) => this.update({ focus });
  /** Store unsubmitted text only in the existing owner-scoped private draft service. */
  async persistInput(): Promise<boolean> {
    if (this.inputWrite) return this.inputWrite;
    if (!this.active || !this.state.bundle || !this.state.inputDirty || this.state.busy || this.state.loading || this.state.pending) return true;
    if (this.state.bundle.task.status !== "active" || this.state.bundle.ruleChanged) return true;
    const id = this.state.bundle.task.id, lifetime = this.lifetime;
    const run = async () => {
      this.update({ inputSaving: true });
      try {
        for (let round = 0; round < 5; round++) {
          const text = this.state.input;
          const latest = await this.request<TaskView>(`/${id}`);
          if (this.selectedId !== id) return false;
          const next = await this.request<TaskView>(`/${id}`, "PATCH", {
            action: "notes", revision: latest.task.revision, key: COMPOSER_DRAFT_KEY, text, contractVersion: "private-notes/1",
          });
          if (this.selectedId !== id) return false;
          this.accept(next, true);
          if (this.state.input === text) return true;
        }
        return false;
      } catch (error) { this.fail(error); return false; }
      finally { if (lifetime === this.lifetime) this.update({ inputSaving: false }); }
    };
    this.inputWrite = run();
    try { return await this.inputWrite; }
    finally { if (lifetime === this.lifetime) this.inputWrite = null; }
  }
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
    } catch (error) {
      if (generation === this.generation) { this.update({ tasks: [] }); this.fail(error); }
    }
  }
  async select(id: string) {
    if (!UUID.test(id) || this.state.busy || this.state.notesDirty) return;
    if (!await this.persistInput() || !this.active) return;
    const generation = ++this.generation;
    this.selectedId = id;
    this.update({ bundle: null, recoveryTaskId: null, notes: "", input: "", inputDirty: false, focus: { mode: "auto" }, pending: null, creation: null, loading: true, error: null });
    try {
      const bundle = await this.request<TaskView>(`/${id}`);
      if (generation === this.generation) this.accept(bundle, false, true);
    } catch (error) { if (generation === this.generation) this.fail(error, true); }
    finally { if (this.active && generation === this.generation) this.update({ loading: false }); }
  }
  newTask = async () => {
    if (this.state.busy || this.state.notesDirty) return;
    if (!await this.persistInput() || !this.active) return;
    this.generation++;
    this.selectedId = null;
    this.remember(null);
    const input = this.inputs.get("new") ?? "";
    this.update({ bundle: null, recoveryTaskId: null, input, inputDirty: !!input, focus: { mode: "auto" }, notes: "", notesDirty: false, error: null, pending: null, creation: null, loading: false });
  };
  // Refresh is read-only: an orphan request is never automatically replayed.
  async refresh(includeList = true) {
    if (this.state.busy || this.state.loading || this.state.inputSaving) return;
    const id = this.selectedId, generation = this.generation;
    try {
      const bundle = id ? await this.request<TaskView>(`/${id}`) : null;
      if (generation !== this.generation) return;
      if (bundle) this.accept(bundle, true);
      if (includeList) await this.refreshList();
    } catch (error) { if (generation === this.generation) this.fail(error, !!id); }
  }
  async change(action: Record<string, unknown>) {
    if (!this.state.bundle || this.state.busy || !await this.persistInput()) return;
    const bundle = this.state.bundle;
    if (!bundle) return;
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
    if (!await this.persistInput() || this.state.busy || !this.active) return;
    const question = this.state.creation?.question ?? this.state.input.trim();
    this.update({ busy: true, error: null });
    const lifetime = this.lifetime;
    try {
      await this.navigation?.sync();
      let task = this.state.bundle?.task;
      if (!task) {
        const creation = this.state.creation ?? { requestId: crypto.randomUUID(), question };
        this.update({ creation });
        task = await this.request<TaskRecord>("", "POST", { requestId: creation.requestId, goal: question.slice(0, 1000), targets: [] });
        this.selectedId = task.id;
        this.inputs.delete("new");
        this.remember(task.id);
        this.update({ creation: null });
        this.accept(await this.request<TaskView>(`/${task.id}`));
      }
      this.accept(await this.request<TaskView>(`/${task.id}`));
      task=this.state.bundle!.task;
      const pending = { requestId: crypto.randomUUID(), question, revision: task.revision,
        ...(this.state.pageContext ? { pageContext: this.state.pageContext, focus: this.state.focus } : this.state.focus.mode !== "auto" ? { focus: this.state.focus } : {}) };
      this.inputs.set(task.id, "");
      this.update({ pending, input: "", inputDirty: false });
      const result=await this.request<{navigation?:string;replayed?:boolean}>(`/${task.id}/turn`, "POST", pending);
      if(!result.replayed&&result.navigation&&/^\/(copilot|segment|strategy|solution|planning|account|pipeline|catalog)(\/|\?|$)/.test(result.navigation))this.navigation?.open(result.navigation);
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
    if (turn) { this.setInput(pending.question); this.update({ pending: null, error: null }); return; }
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
    this.inputs.clear(); this.inputWrite = null; this.formContext = null; this.pageListing = null; this.routeContext = null;
    this.state = { tasks: [], bundle: null, recoveryTaskId: null, input: "", inputDirty: false, inputSaving: false, pageContext: null, focus: { mode: "auto" }, notes: "", notesDirty: false, busy: false, loading: true, error: null, pending: null, creation: null };
  }
}
