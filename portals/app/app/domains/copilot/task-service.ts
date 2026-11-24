import { BUSINESS_TOOLS, EXECUTION_TOOLS, formContract } from "./business-tools";
import { isTaskFocus, isTaskPageContext, type TaskPageContext, type TaskFocus } from "./lib/page-context";
import { BUSINESS_FORM_CONTRACT, isFormModule, mergeForm, readBusinessForm, formHref, type BusinessForm } from "./lib/business-form";
import { createHash } from "node:crypto";
import { budgetFailureArtifacts, taskArtifacts } from "./lib/task-artifacts";
import { can, type PermissionHolder } from "../../authz/decide";
import type { Entitlement } from "../../entitlement/types";
import { featureKeysFor } from "../../entitlement/capability";
import { recordAuditEvent } from "../../audit/lib/record";
import { defaultTurnMeter } from "../../usage/lib/copilot-turns";
import { runTurn, TurnBudgetError } from "../../agent/orchestrator/turn";
import type { TurnDeps } from "./turn-service";
import {
  TASK_RULE_VERSION,
  TASK_STATES,
  UUID,
  isTaskObject,
  taskToolAllowed,
  type TaskObject,
  type TaskScope,
  type TaskSource,
} from "./lib/task-contract";
import type { CopilotStore } from "./store";
import type { KnowledgeStore } from "./knowledge-store";
import { checkTaskKnowledge, recallBusinessKnowledge, KnowledgeRefusal } from "./knowledge-service";
import type { MemoryStore } from "./memory-store";
import { checkTaskMemory, recallPrivateMemories, MemoryRefusal } from "./memory-service";
import {
  taskCreationFingerprint,
  type TaskBundle,
  type TaskMutation,
  type TaskRecord,
  type TaskReference,
  type TaskStore,
} from "./task-store";
import { fail, ok, violation, type RuleResult } from "../shared/result";

export interface TaskContext {
  execution?: {
    propose:(taskId:string,key:string,operation:"save"|"publish")=>Promise<unknown>;
    receipts:(taskId:string)=>Promise<unknown>;
  };
  business?: {
    access: TaskSource;
    contract?:(module:import("./lib/business-form").FormModule)=>Promise<unknown>;
    query:(input:Record<string,unknown>)=>Promise<{records:unknown[];sources:TaskSource[];limited:boolean;recordState:string}>;
    prepare:(form:BusinessForm)=>Promise<BusinessForm>;
  };
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: TaskStore;
  sessions: CopilotStore;
  memory?: MemoryStore;
  knowledge?: KnowledgeStore;
  knowledgeMembers?: () => Promise<{ sub: string; displayName: string | null }[]>;
  judgementEvidence?: (objects: TaskSource[]) => Promise<unknown[]>;
  source: (object: TaskObject) => Promise<TaskSource | null>;
  // Must re-read current identity, entitlement, permissions and data scope.
  // An in-flight model result must not use a request-start permission snapshot.
  refresh: () => Promise<TaskContext | null>;
}
class TaskRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const scopeOf = (c: TaskContext): TaskScope => ({
  workspaceId: c.workspaceId,
  actorSub: c.sub,
});
function demand(yes: unknown, code: string): asserts yes {
  if (!yes) throw new TaskRefusal(code);
}
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function gate(c: TaskContext): void {
  const g = can(c.holder, c.entitlement, "copilot.ask", "data");
  demand(g.allowed, g.reason ?? "permission_denied");
  demand(c.entitlement.workspace_id === c.workspaceId, "permission_denied");
}
async function guarded<T>(
  ctx: TaskContext,
  operation: string,
  fn: () => Promise<T>,
): Promise<RuleResult<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (!(e instanceof TaskRefusal) && !(e instanceof MemoryRefusal) && !(e instanceof KnowledgeRefusal)) throw e;
    await recordAuditEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.sub,
      objectType: "xiaoyu_task",
      objectId: "request",
      action: `${TASK_RULE_VERSION}.${operation}`,
      outcome: "denied",
    });
    return fail(violation(e.code, "task request refused"));
  }
}
function body(value: unknown, keys: string[]): Record<string, unknown> {
  demand(
    value && typeof value === "object" && !Array.isArray(value),
    "invalid_task_request",
  );
  const v = value as Record<string, unknown>;
  demand(
    Object.keys(v).every((k) => keys.includes(k)),
    "invalid_task_request",
  );
  return v;
}
async function current(ctx: TaskContext): Promise<TaskContext> {
  const now = await ctx.refresh();
  demand(
    now && now.workspaceId === ctx.workspaceId && now.sub === ctx.sub,
    "access_changed",
  );
  gate(now);
  return now;
}
async function checkSources(ctx: TaskContext, b: TaskBundle): Promise<void> {
  await checkTaskKnowledge(ctx, b.task.id);
  await checkTaskMemory(ctx, b.task.id);
  for (const r of b.references) {
    const live = await ctx.source({ kind: r.kind, id: r.id });
    demand(live, "source_unavailable");
    demand(
      live.kind === r.kind && live.id === r.id && live.version === r.version,
      "source_changed",
    );
  }
}
async function owned(
  ctx: TaskContext,
  id: string,
  content = false,
): Promise<TaskBundle> {
  gate(ctx);
  demand(UUID.test(id), "not_found");
  const meta = await ctx.store.load(scopeOf(ctx), id);
  demand(meta, "not_found");
  await checkSources(ctx, meta);
  if (!content) return meta;
  const all = await ctx.store.load(scopeOf(ctx), id, true);
  demand(all && all.task.revision === meta.task.revision, "task_conflict");
  return all;
}
async function source(
  ctx: TaskContext,
  object: TaskObject,
  role: TaskReference["role"],
): Promise<Omit<TaskReference, "referenceId">> {
  const r = await ctx.source(object);
  demand(
    r && r.kind === object.kind && r.id === object.id,
    "source_unavailable",
  );
  return { ...r, role };
}
function active(b: TaskBundle): void {
  demand(
    b.task.status === "active" || b.task.status === "paused",
    "task_finished",
  );
}
function publicBundle(b: TaskBundle, business=false, execution=false) {
  return {
    ...b,
    currentRuleVersion: TASK_RULE_VERSION,
    ruleChanged: b.task.ruleVersion !== TASK_RULE_VERSION,
    capabilities: {
      conversation: true,
      privateNotes: true,
      businessRead: business,
      formDraft: business,
      save: execution,
      publish: execution,
      taskGrantRequired: execution,
      directModelWrite: false,
    },
    recovery: {
      automaticModelRetry: false,
      automaticBusinessSubmit: false,
      interruptedRequests: b.turns
        .filter((t) => t.status === "running")
        .map((t) => t.requestId),
    },
  };
}

export async function createPrivateTask(
  ctx: TaskContext,
  input: unknown,
): Promise<RuleResult<TaskRecord>> {
  return guarded(ctx, "create", async () => {
    gate(ctx);
    const v = body(input, ["requestId", "goal", "targets"]);
    demand(
      typeof v.requestId === "string" && UUID.test(v.requestId),
      "invalid_task_request",
    );
    demand(
      typeof v.goal === "string" &&
        v.goal.trim().length > 0 &&
        v.goal.length <= 1000,
      "invalid_task_request",
    );
    const targets = v.targets ?? [];
    demand(
      Array.isArray(targets) &&
        targets.length <= 20 &&
        targets.every(isTaskObject),
      "invalid_task_request",
    );
    const refs: Omit<TaskReference, "referenceId">[] = [];
    for (const t of targets)
      if (!refs.some((r) => r.kind === t.kind && r.id === t.id))
        refs.push(await source(ctx, t, "target"));
    const task = await ctx.store.create(
      scopeOf(ctx),
      v.goal.trim(),
      TASK_RULE_VERSION,
      refs,
      v.requestId,
    );
    demand(
      task.requestHash === taskCreationFingerprint(v.goal.trim(), refs),
      "request_conflict",
    );
    const verified = await owned(await current(ctx), task.id);
    demand(
      refs.every((r) =>
        verified.references.some(
          (old) =>
            old.kind === r.kind && old.id === r.id && old.role === "target",
        ),
      ),
      "request_conflict",
    );
    return verified.task;
  });
}
export async function listPrivateTasks(
  ctx: TaskContext,
): Promise<RuleResult<TaskRecord[]>> {
  return guarded(ctx, "list", async () => {
    gate(ctx);
    const rows = await ctx.store.list(scopeOf(ctx)),
      allowed: TaskRecord[] = [];
    for (const task of rows) {
      try {
        await owned(ctx, task.id);
        allowed.push(task);
      } catch (e) {
        if (!(e instanceof TaskRefusal)) throw e;
      }
    }
    // Listing must also check freshness before handing out private titles.
    const fresh = await current(ctx),
      result: TaskRecord[] = [];
    for (const task of allowed) {
      try {
        await owned(fresh, task.id);
        result.push(task);
      } catch (e) {
        if (!(e instanceof TaskRefusal)) throw e;
      }
    }
    return result;
  });
}
export async function readPrivateTask(ctx: TaskContext, id: string) {
  return guarded(ctx, "read", async () => {
    const bundle = await owned(await current(ctx), id, true);
    const fresh = await owned(await current(ctx), id);
    demand(bundle.task.revision === fresh.task.revision, "task_conflict");
    return publicBundle(bundle,!!ctx.business,!!ctx.execution);
  });
}

async function mutation(
  ctx: TaskContext,
  b: TaskBundle,
  v: Record<string, unknown>,
): Promise<TaskMutation> {
  const patch: TaskMutation = { ruleVersion: TASK_RULE_VERSION };
  switch (v.action) {
    case "page":
      body(v, ["action", "revision", "page"]);
      active(b);
      demand(v.page === null || isTaskObject(v.page), "invalid_task_request");
      patch.page = v.page;
      patch.references = v.page ? [await source(ctx, v.page, "context")] : [];
      break;
    case "link":
      body(v, ["action", "revision", "object"]);
      active(b);
      demand(isTaskObject(v.object), "invalid_task_request");
      demand(b.references.length < 100, "task_source_limit");
      patch.references = [await source(ctx, v.object, "target")];
      break;
    case "business_form": {
      body(v,["action","revision","key","fields"]); active(b);
      demand(ctx.business && typeof v.key==="string" && /^[a-zA-Z0-9_-]{1,64}$/.test(v.key),"invalid_form_fields");
      const content=await ctx.store.load(scopeOf(ctx),b.task.id,true),row=content?.drafts.find(d=>d.key===v.key&&d.contractVersion===BUSINESS_FORM_CONTRACT);
      demand(row,"invalid_form_fields");
      const previous=readBusinessForm(row.text),form=await ctx.business.prepare(mergeForm(previous,previous.module,previous.targetId,v.fields,true));
      patch.draft={key:v.key,text:JSON.stringify(form),contractVersion:BUSINESS_FORM_CONTRACT};
      patch.references=form.sources.map(s=>({...s,role:"context"}));
      break;
    }
    case "notes":
      body(v, ["action", "revision", "key", "text", "contractVersion"]);
      active(b);
      demand(
        v.contractVersion === "private-notes/1" &&
          typeof v.key === "string" &&
          /^[a-zA-Z0-9_-]{1,64}$/.test(v.key) &&
          typeof v.text === "string" &&
          v.text.length <= 10000,
        "invalid_draft",
      );
      patch.draft = { key: v.key, text: v.text };
      break;
    case "status":
      body(v, ["action", "revision", "status"]);
      active(b);
      demand(
        typeof v.status === "string" &&
          (TASK_STATES as readonly string[]).includes(v.status),
        "invalid_task_request",
      );
      patch.status = v.status as TaskMutation["status"];
      break;
    case "legacy": {
      body(v, ["action", "revision", "sessionId"]);
      active(b);
      demand(
        typeof v.sessionId === "string" && UUID.test(v.sessionId),
        "not_found",
      );
      const old = await ctx.sessions.getSession(ctx.workspaceId, v.sessionId);
      demand(old && old.actorSub === ctx.sub, "not_found");
      if (old.subjectType && old.subjectId)
        patch.references = [
          await source(
            ctx,
            {
              kind: old.subjectType === "plan" ? "strategy" : old.subjectType,
              id: old.subjectId,
            },
            "legacy",
          ),
        ];
      // Missing per-message provenance: no legacy text is copied or replayed.
      patch.legacySessionId = old.id;
      break;
    }
    case "resume":
      body(v, ["action", "revision", "checkpointId"]);
      active(b);
      if (v.checkpointId !== undefined)
        demand(v.checkpointId === b.checkpoint?.id, "checkpoint_changed");
      patch.status = "active";
      break;
    default:
      throw new TaskRefusal("task_tool_denied");
  }
  const additions = (patch.references ?? []).filter(
    (r) =>
      !b.references.some(
        (old) => old.kind === r.kind && old.id === r.id && old.role === r.role,
      ),
  );
  demand(b.references.length + additions.length <= 100, "task_source_limit");
  if (patch.draft && !b.drafts.some((d) => d.key === patch.draft!.key)) {
    // Metadata loads deliberately omit note text; count is checked on content below.
    const content = await ctx.store.load(scopeOf(ctx), b.task.id, true);
    demand(
      content &&
        (content.drafts.some((d) => d.key === patch.draft!.key) ||
          content.drafts.length < 20),
      "task_draft_limit",
    );
  }
  return patch;
}
export async function changePrivateTask(
  ctx: TaskContext,
  id: string,
  input: unknown,
) {
  return guarded(ctx, "change", async () => {
    let now = await current(ctx);
    const meta = await owned(now, id);
    const v = body(input, [
      "action",
      "revision",
      "page",
      "object",
      "key",
      "text",
      "contractVersion",
      "status",
      "sessionId",
      "checkpointId",
      "requestId",
      "fields",
    ]);
    demand(
      Number.isSafeInteger(v.revision) && v.revision === meta.task.revision,
      "task_conflict",
    );
    const release = await ctx.sessions.acquireSessionTurn(
      ctx.workspaceId,
      meta.task.sessionId,
    );
    demand(release, "turn_in_progress");
    try {
      now = await current(ctx);
      const b = await owned(now, id);
      demand(b.task.revision === v.revision, "task_conflict");
      if (v.action === "interrupt") {
        body(v, ["action", "revision", "requestId"]);
        const turn = b.turns.find(
          (t) => t.requestId === v.requestId && t.status === "running",
        );
        demand(turn, "request_not_running");
        demand(
          await ctx.store.finishTurn(scopeOf(ctx), id, turn.id, {
            errorCode: "request_interrupted",
            interrupted: true,
          }),
          "task_conflict",
        );
      } else {
        const patch = await mutation(now, b, v);
        demand(
          taskToolAllowed(
            {
              tool: patch.draft?.contractVersion === BUSINESS_FORM_CONTRACT ? "business.form" : patch.draft ? "draft.notes" : "task.update",
              ...scopeOf(ctx),
              ruleVersion: TASK_RULE_VERSION,
            },
            scopeOf(ctx),
          ),
          "task_tool_denied",
        );
        demand(
          await ctx.store.mutate(scopeOf(ctx), id, b.task.revision, patch),
          "task_conflict",
        );
      }
      return publicBundle(await owned(await current(ctx), id, true),!!now.business,!!now.execution);
    } finally {
      await release();
    }
  });
}

export async function runPrivateTaskTurn(
  ctx: TaskContext,
  id: string,
  input: unknown,
  deps: TurnDeps & { tenantId: string; subjectToken?: string },
) {
  return guarded(ctx, "turn", async () => {
    const v = body(input, ["requestId", "revision", "question", "pageContext", "focus"]);
    demand(v.pageContext === undefined || isTaskPageContext(v.pageContext), "invalid_task_request");
    demand(v.focus === undefined || isTaskFocus(v.focus), "invalid_task_request");
    const pageContext = v.pageContext as TaskPageContext | undefined, focus = v.focus as TaskFocus | undefined;
    demand(
      typeof v.requestId === "string" &&
        UUID.test(v.requestId) &&
        typeof v.question === "string" &&
        v.question.trim() &&
        v.question.length <= 10000,
      "invalid_task_request",
    );
    const question = v.question.trim(),
      questionHash = hash(pageContext || focus ? { question, pageContext, focus } : question);
    let now = await current(ctx),
      b = await owned(now, id, true);
    const contextSources: TaskSource[] = [];
    for (const object of [pageContext?.object, focus?.mode === "manual" ? focus.object : null]) {
      if (!object) continue;
      const found = await now.source(object);
      demand(found, "source_unavailable");
      contextSources.push(found);
    }
    const replay = () => {
      const old = b.turns.find((t) => t.requestId === v.requestId);
      if (!old) return null;
      demand(old.questionHash === questionHash, "request_conflict");
      demand(
        old.status === "succeeded",
        old.status === "running"
          ? "request_in_progress"
          : "request_already_attempted",
      );
      demand(old.ruleVersion === TASK_RULE_VERSION, "rule_changed");
      const message = b.messages.find((m) => m.id === old.assistantMessageId);
      demand(message, "request_unavailable");
      return {
        taskId: id,
        sessionId: b.task.sessionId,
        requestId: v.requestId,
        answer: message.content,
        replayed: true,
        ruleVersion: TASK_RULE_VERSION,
      };
    };
    const previous = replay();
    if (previous) return previous;
    demand(
      Number.isSafeInteger(v.revision) && v.revision === b.task.revision,
      "task_conflict",
    );
    demand(b.task.status === "active", "task_not_active");
    demand(b.task.ruleVersion === TASK_RULE_VERSION, "rule_changed");
    demand(deps.tenantId, "tenant_required");
    const release = await ctx.sessions.acquireSessionTurn(
      ctx.workspaceId,
      b.task.sessionId,
    );
    demand(release, "turn_in_progress");
    try {
      now = await current(ctx);
      b = await owned(now, id, true);
      const repeated = replay();
      if (repeated) return repeated;
      const meter = deps.meter ?? defaultTurnMeter();
      demand(meter.admit(now.entitlement).ok, "quota_exceeded");
      demand(
        taskToolAllowed(
          {
            tool: "model.chat",
            ...scopeOf(now),
            ruleVersion: TASK_RULE_VERSION,
          },
          scopeOf(ctx),
        ),
        "task_tool_denied",
      );
      const turn = await ctx.store.beginTurn(
        scopeOf(ctx),
        id,
        v.revision as number,
        v.requestId,
        question,
        questionHash,
        TASK_RULE_VERSION,
      );
      demand(turn, "task_conflict");
      try {
        await meter.record(ctx.workspaceId, turn.userMessageId);
        const knowledge = await recallBusinessKnowledge(now, b, question);
        const memories = await recallPrivateMemories(now, b, question);
        const judgements = now.judgementEvidence ? await now.judgementEvidence(b.references) : [];
        const turnSources=new Map<string,TaskSource>();
        const forms=new Map<string,{key:string;text:string}>();
        const newFormPages=new Map<string,string>();
        let navigation:string|undefined;
        let verifiedReceipt=false;
        const executionQueue=new Map<string,"save"|"publish">();
        const bind=(sources:TaskSource[])=>{for(const r of sources){const key=`${r.kind}:${r.id}`,old=turnSources.get(key)??b.references.find(x=>x.kind===r.kind&&x.id===r.id);demand(!old||old.version===r.version,"source_changed");turnSources.set(key,r);}demand(new Set([...b.references,...turnSources.values()].map(r=>`${r.kind}:${r.id}`)).size<=100,"task_source_limit");};
        bind(contextSources);
        const recheck=async()=>{const live=await current(ctx);await owned(live,id);for(const r of turnSources.values()){const source=await live.source(r);demand(source&&source.version===r.version,"source_changed");}return live;};
        const localTools=now.business ? {definitions:[...BUSINESS_TOOLS,...(now.execution?EXECUTION_TOOLS:[])],invoke:async(name:string,args:Record<string,unknown>)=>{
          const live=await recheck();demand(live.business,"task_tool_denied");
          bind([live.business.access]);
          try {
            if(name==="request_business_execution"){
              demand(live.execution&&Object.keys(args).every(k=>["key","operation"].includes(k))&&typeof args.key==="string"&&/^[a-zA-Z0-9_-]{1,64}$/.test(args.key)&&(args.operation==="save"||args.operation==="publish"),"task_tool_denied");
              demand(forms.has(args.key)||b.drafts.some(d=>d.key===args.key&&d.contractVersion===BUSINESS_FORM_CONTRACT),"invalid_form_fields");
              executionQueue.set(args.key,args.operation as "save"|"publish");
              return {state:"proposal_queued_for_review",saved:false,published:false,authorization:"User must authorize exact form snapshot; workspace mode alone is insufficient."};
            }
            if(name==="read_execution_receipts"){
              demand(live.execution&&Object.keys(args).length===0,"task_tool_denied");
              const receipts=await live.execution.receipts(id);await recheck();verifiedReceipt=Array.isArray(receipts)&&receipts.length>0;return {receipts};
            }
            if(name==="query_business"){const result=await live.business.query(args);bind(result.sources);await recheck();return result;}
            if(name==="business_form_contract"){demand(isFormModule(args.module)&&Object.keys(args).length===1,"invalid_form_fields");return live.business.contract?await live.business.contract(args.module):formContract(args.module);}
            if(name==="prepare_business_form") {
              demand(Object.keys(args).every(k=>["module","key","targetId","fields"].includes(k))&&isFormModule(args.module)&&typeof args.key==="string"&&/^[a-zA-Z0-9_-]{1,64}$/.test(args.key)&&(args.targetId===undefined||(typeof args.targetId==="string"&&UUID.test(args.targetId))),"invalid_form_fields");
              const stored=forms.get(args.key)??b.drafts.find(d=>d.key===args.key&&d.contractVersion===BUSINESS_FORM_CONTRACT);
              const previous=stored?readBusinessForm(stored.text):null;
              const prepared=await live.business.prepare(mergeForm(previous,args.module,(args.targetId as string|undefined)??null,args.fields));
              prepared.sources=[...prepared.sources,...turnSources.values(),...b.references].filter((s,i,rows)=>rows.findIndex(r=>r.kind===s.kind&&r.id===s.id)===i);
              bind(prepared.sources);await recheck();
              demand(b.drafts.length+forms.size<20||!!stored,"task_draft_limit");
              forms.set(args.key,{key:args.key,text:JSON.stringify(prepared)});
              navigation=formHref(prepared,id,args.key);
              if (prepared.targetId === null) newFormPages.set(navigation.split("?", 1)[0]!, navigation);
              return {status:"private_form_prepared",key:args.key,fields:prepared.fields,protectedFields:prepared.manualFields,href:navigation,saved:false,published:false};
            }
            if(name==="open_business_page"){
              demand(Object.keys(args).every(k=>["module","id","create"].includes(k))&&typeof args.module==="string"&&(args.id===undefined||(typeof args.id==="string"&&UUID.test(args.id))),"task_tool_denied");
              const routes:Record<string,string>={segment:"/segment",solution:"/solution",strategy:"/strategy",sales_plan:"/planning",account:"/account",opportunity:"/pipeline",product:"/catalog"};
              const route=routes[args.module];demand(route,"task_tool_denied");
              if(args.id){const source=await live.source({kind:args.module as TaskObject["kind"],id:args.id as string});demand(source,"source_unavailable");bind([source]);}
              navigation=args.create?`${route}/new`:args.id?["product","solution"].includes(args.module as string)?`${route}?id=${args.id}`:`${route}/${args.id}`:route;
              if(args.module==="sales_plan")navigation=route;
              // Opening the just-prepared creation page must carry its private
              // draft binding. Explicit navigation to another page stays bare.
              if (args.id === undefined) navigation = newFormPages.get(navigation) ?? navigation;
              return {status:"navigation_ready",href:navigation,saved:false};
            }
            throw new TaskRefusal("task_tool_denied");
          }catch(e){if(e instanceof TaskRefusal)throw e;return {ok:false,error:e instanceof Error&&/^[a-z_]{1,64}$/.test(e.message)?e.message:"business_tool_failed"};}
        }} : undefined;
        const researchStartedAt = Date.now();
        const result = await runTurn(
          {
            question,
            history: b.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            prompt: {
              productName: "Yucer",
              permissions: [...now.holder.permissions],
              features: featureKeysFor(now.entitlement),
              judgements,
              businessKnowledge: knowledge.map(r => ({id:r.id,revision:r.revision,title:r.title,text:r.text,kind:r.kind,updatedAt:r.updatedAt.toISOString(),sources:r.sources})),
              privateMemories: memories.map(r => ({id:r.id, revision:r.revision, text:r.text, kind:r.kind, createdAt:r.createdAt.toISOString(), updatedAt:r.updatedAt.toISOString(), sources:r.sources})),
              task: {
                id,
                goal: b.task.goal,
                businessTools:!!now.business,
                businessForms:b.drafts.filter(d=>d.contractVersion===BUSINESS_FORM_CONTRACT).map(d=>{const {baseline:_baseline,...form}=readBusinessForm(d.text);return {key:d.key,...form};}),
                targets: b.references
                  .filter((r) => r.role === "target")
                  .map((r) => ({ kind: r.kind, id: r.id })),
                page: b.task.page,
                pageContext,
                focus,
              },
            },
            atlas: {
              workspaceId: ctx.workspaceId,
              tenantId: deps.tenantId,
              subjectToken: deps.subjectToken,
              applicationId: b.task.sessionId,
              requestId: turn.id,
              taskId: id,
              featureId: "copilot.chat",
              businessId: turn.userMessageId,
            },
            runos: {
              workspaceId: ctx.workspaceId,
              tenantId: deps.tenantId,
              subjectToken: deps.subjectToken,
              taskId: id,
              sessionId: b.task.sessionId,
            },
            draftOnly: true,
            deferCapabilities: true,
            readOnlyTools: !!now.business,
            rejectUnexpectedTools: !now.business,
            localTools,
            beforeTool: async()=>{await recheck();},
            profile: /(?:\u586b\u5199|\u65b0\u5efa|\u521b\u5efa|draft|fill|create)/i.test(question)?"drafting":/(?:\u5206\u6790|\u89c4\u5212|\u6218\u7565|analy|plan|strategy)/i.test(question)?"judgement":"dialogue",
            maxToolRounds: 16,
            totalBudget:{deadlineMs:240000,maxTokens:40000,maxCalls:64},
          },
          deps,
        );
        demand(result.answer.trim().length > 0, "task_model_failed");
        if(now.business&&/(?:\u5df2(?:\u6210\u529f)?(?:\u4fdd\u5b58|\u53d1\u5e03|\u63d0\u4ea4|\u521b\u5efa)|successfully (?:saved|published|submitted|created))/i.test(result.answer))result.answer=verifiedReceipt?"\u5df2\u6838\u5bf9\u73b0\u6709\u6267\u884c\u56de\u6267\uff0c\u8bf7\u4ee5\u6267\u884c\u6e05\u5355\u4e2d\u7684\u5b9e\u9645\u4e1a\u52a1\u8bb0\u5f55\u4e3a\u51c6\u3002":forms.size?"\u5df2\u51c6\u5907\u8868\u5355\u8349\u7a3f\uff0c\u8bf7\u6253\u5f00\u590d\u6838\u540e\u4fdd\u5b58\u3002":"\u5206\u6790\u5df2\u5b8c\u6210\uff0c\u672c\u56de\u5408\u6ca1\u6709\u4fdd\u5b58\u6216\u53d1\u5e03\u4e1a\u52a1\u8bb0\u5f55\u3002";
        if(result.truncated)result.answer+="\n\n\u672c\u8f6e\u5df2\u8fbe\u5230\u5de5\u5177\u8f6e\u6b21\u9650\u989d\uff0c\u5df2\u4fdd\u7559\u5f53\u524d\u8349\u7a3f\uff1b\u5269\u4f59\u6b65\u9aa4\u5c1a\u672a\u5b8c\u6210\u3002";
        // No model output is persisted or delivered after revocation or source
        // changes. Sources are re-read, not trusted from the old checkpoint.
        now = await recheck();
        demand(
          await ctx.store.finishTurn(scopeOf(ctx), id, turn.id, {
            answer: result.answer,
            tokens: result.totalTokens,
            artifacts: taskArtifacts(result, researchStartedAt),
            references:[...turnSources.values()].map(r=>({...r,role:"context"})),
            forms:[...forms.values()],
          }),
          "task_conflict",
        );
        await owned(await current(ctx), id);
        const proposals=[];
        for(const [key,operation] of executionQueue){
          try{proposals.push({key,operation,state:"waiting_authorization",proposal:await (await current(ctx)).execution?.propose(id,key,operation)});}
          catch{proposals.push({key,operation,state:"proposal_unavailable"});}
        }
        await recordAuditEvent({
          workspaceId: ctx.workspaceId,
          actorId: ctx.sub,
          objectType: "xiaoyu_task",
          objectId: id,
          action: `${TASK_RULE_VERSION}.copilot.ask`,
          outcome: "success",
          taskId: id,
          costAmount: result.totalTokens,
          costUnit: "tokens",
        });
        return {
          taskId: id,
          sessionId: b.task.sessionId,
          requestId: v.requestId,
          answer: result.answer,
          navigation,
          proposals,
          incomplete:result.truncated,
          replayed: false,
          ruleVersion: TASK_RULE_VERSION,
        };
      } catch (e) {
        const code =
          e instanceof TaskRefusal || e instanceof MemoryRefusal || e instanceof KnowledgeRefusal
            ? e.code
            : e instanceof Error && e.message === "task_budget_exhausted" ? "task_budget_exhausted" : e instanceof Error && e.message === "tool_boundary_denied"
              ? "task_tool_denied"
              : "task_model_failed";
        await ctx.store.finishTurn(scopeOf(ctx), id, turn.id, {
          errorCode: code,
          ...(e instanceof TurnBudgetError ? { artifacts: budgetFailureArtifacts(e.usage) } : {}),
        });
        await recordAuditEvent({
          workspaceId: ctx.workspaceId,
          actorId: ctx.sub,
          objectType: "xiaoyu_task",
          objectId: id,
          action: `${TASK_RULE_VERSION}.copilot.ask`,
          outcome: e instanceof TaskRefusal ? "denied" : "error",
          taskId: id,
          ...(e instanceof TurnBudgetError ? { costAmount: e.usage.totalTokens, costUnit: "tokens" } : {}),
        });
        throw new TaskRefusal(code);
      }
    } finally {
      await release();
    }
  });
}
