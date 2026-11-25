"use client";
import { XiaoyuMarkdown } from "./xiaoyu-markdown";
import { useXiaoyuCatalog } from "./use-xiaoyu-catalog";
import { readableText } from "../../domains/copilot/lib/form-review";
import { XiaoyuInputTools } from "./xiaoyu-input-tools";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShellDock } from "@vxture/design-system";
import {
  Banner, Button, Card, Collapsible, CollapsibleContent, CollapsibleTrigger, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, Icon, Popover, PopoverContent, StatusBadge,
  PopoverTrigger, Textarea,
} from "@vxture/design-ui";
import { AssistantComposer, AssistantMessage, AssistantTranscript } from "./assistant-conversation";
import { useXiaoyu } from "./xiaoyu-provider";
import { useMessages } from "../lib/i18n/provider";
import { workspaceHref } from "../lib/xiaoyu-client";
import { UUID } from "../../domains/copilot/lib/task-contract";
import type { Dictionary } from "../lib/i18n/dictionary";
import type { TaskRecord } from "../../domains/copilot/task-store";
import { ConfirmDestructive } from "./confirm-destructive";
import { XiaoyuTopics } from "./xiaoyu-topics";
import { XiaoyuResearch } from "./xiaoyu-research";
import { XiaoyuFormLinks } from "./xiaoyu-form-link";
import { AssistantWidthToggle, useAssistantWidth } from "./assistant-width";
import { useAssistantVisibility } from "./assistant-visibility";
import { useDockSize } from "./use-dock-size";
import { WorkspaceContent } from "./workspace-layout";
import { AssistantMode } from "./assistant-mode";
import styles from "./xiaoyu-workspace.module.css";
import { taskWorkspaceView, type WorkspaceView } from "../../domains/copilot/lib/workspace-view";

type Copy = Dictionary["XIAOYU_TEXT"];
const taskStatus = (t: Copy, status: TaskRecord["status"]) =>
  ({ active: t.statusActive, paused: t.statusPaused, completed: t.statusCompleted, cancelled: t.statusCancelled })[status];

function errorText(code: string, t: Copy) {
  code = code.toUpperCase();
  if (/SOURCE_CHANGED/.test(code)) return t.sourceChanged;
  if (/SOURCE_UNAVAILABLE|NOT_FOUND/.test(code)) return t.sourceUnavailable;
  if (/ACCESS_CHANGED|POLICY_DENIED|NOT_ENTITLED/.test(code)) return t.accessChanged;
  if (/CONFLICT/.test(code)) return t.conflict;
  if (/BUDGET_EXHAUSTED/.test(code)) return t.budgetExceeded;
  if (/VERIFICATION_UNAVAILABLE/.test(code)) return t.verificationUnavailable;
  if (/PERSISTENCE_FAILED/.test(code)) return t.persistenceFailed;
  if (/COMPLETION_FAILED/.test(code)) return t.completionFailed;
  if (/MODEL_FAILED/.test(code)) return t.modelFailed;
  if (/TOOL_DENIED/.test(code)) return t.toolDenied;
  if (/QUOTA/.test(code)) return t.quota;
  if (/RULE_CHANGED/.test(code)) return t.ruleChanged;
  return t.unavailable;
}

function AgentMark({ large = false }: { readonly large?: boolean }) {
  return <span className={large ? styles.agentMarkLarge : styles.agentMark} aria-hidden="true">
    <Icon name="sparkles" size={large ? "lg" : "sm"} weight="fill" />
  </span>;
}

export function XiaoyuWorkspace({ initialTask, today = false, editor }: { readonly initialTask?: string; readonly today?: boolean; readonly editor?: ReactNode }) {
  const panel = useAssistantVisibility();
  const { client, loading, busy, notesDirty } = useXiaoyu();
  const selected = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialTask || !UUID.test(initialTask) || loading || busy || notesDirty || selected.current === initialTask) return;
    selected.current = initialTask;
    if (client.getSnapshot().bundle?.task.id !== initialTask) void client.select(initialTask);
  }, [client, initialTask, loading, busy, notesDirty]);
  if (today) return <WorkspaceContent canvas><section className={styles.todayBoard} data-xiaoyu-board><XiaoyuTopics compact daily onDiscuss={panel.open} /></section></WorkspaceContent>;
  return <XiaoyuSurface full editor={editor} />;
}

function TaskBoard({ outputKey, editor, labels }: {
  readonly labels: Record<string,string>;
  readonly editor?: ReactNode;
  readonly outputKey: string;
}) {
  const { XIAOYU_TEXT: T, HOME_OVERVIEW_TEXT: H, XIAOYU_FORMS: F } = useMessages();
  const { bundle, busy, recoveryTaskId } = useXiaoyu();
  const view = taskWorkspaceView(bundle);
  const latest = bundle?.messages.find(m => m.id === view.overviewMessageId);
  return <section data-xiaoyu-board className={styles.board} aria-label={T.boardTitle}>
    <header className={styles.boardHeader}>
      <div className="flex min-w-0 flex-1 items-center gap-md">
        <span className="flex shrink-0 items-center gap-sm">
        <Icon name="squares-four" size="sm" />
        <h1 className="text-heading-2">{H.workspace}</h1>
        </span>
        {bundle ? <TaskIdentity view={busy && bundle.task.status === "active" ? {...view,stage:"running"} : view} /> : null}
      </div>
      <Button asChild size="md" variant="ghost"><Link href="/copilot/today" aria-label={H.today}><span className={styles.sceneLinkLabel}>{H.today}</span><Icon name="arrow-right" size="sm" /></Link></Button>
    </header>
    <div className={styles.boardScroll} >
      {editor}
      {outputKey ? <>
        {recoveryTaskId ? <XiaoyuFormLinks /> : null}
        {view.panels.map(panel => panel === "forms" ? <XiaoyuFormLinks key={panel} /> : panel === "sources" ? <XiaoyuResearch key={panel} /> : panel === "activity" ? <TaskActivity key={panel} /> : latest ? <Card key={panel} className="gap-sm p-md">
          <h3 className="flex items-center gap-sm text-label"><Icon name="lightbulb" size="sm" />{T.boardConclusion}</h3>
          <Collapsible key={latest.id}>
            <div className={`${styles.reportPreview} line-clamp-4`}><XiaoyuMarkdown text={latest.content} labels={labels} unavailable={F.referenceUnavailable}/></div>
            <CollapsibleContent className="mt-sm"><XiaoyuMarkdown text={latest.content} labels={labels} unavailable={F.referenceUnavailable}/></CollapsibleContent>
            <CollapsibleTrigger asChild><Button size="md" variant="ghost" className={styles.reportToggle}>
              <span className={styles.expandReport}>{T.expandConclusion}</span><span className={styles.collapseReport}>{T.collapseConclusion}</span><Icon name="chevron-down" size="sm" />
            </Button></CollapsibleTrigger>
          </Collapsible>
        </Card> : null)}
      </> : <div className={styles.boardEmpty}>
        <Icon name="clipboard" size="lg" className="text-muted-foreground" />
        <h2 className="text-label-medium">{T.boardEmpty}</h2>
        <p className="max-w-prose text-body text-muted-foreground">{T.boardEmptyHint}</p>
      </div>}
      {busy ? <p className="text-body-small text-muted-foreground">{T.boardUpdating}</p> : null}
    </div>
  </section>;
}

function TaskIdentity({ view }: { readonly view: WorkspaceView }) {
  const { bundle } = useXiaoyu();
  const { XIAOYU_WORKSPACE: W } = useMessages();
  return <div className={styles.taskIdentity} role="group" aria-label={W.identity} data-task-identity>
    <span className={styles.taskType}>{W.kinds[view.kind]}</span>
    <span className={styles.taskName} title={readableText(bundle?.task.goal??"")}>{readableText(bundle?.task.goal??"")}</span>
    <span className={styles.taskStage} data-stage={view.stage}>{W.stages[view.stage]}</span>
  </div>;
}

function TaskActivity() {
  const { bundle } = useXiaoyu();
  const { XIAOYU_WORKSPACE: W } = useMessages();
  if (!bundle) return null;
  return <Card className="gap-sm p-md" data-task-activity>
    <h3 className="flex items-center gap-sm text-label"><Icon name="list-checks" size="sm" />{W.activity}</h3>
    <p className="text-body-small text-muted-foreground">{W.activityHint}</p>
    {bundle.turns.slice(-5).reverse().map(turn => <div key={turn.id} className="flex min-w-0 items-center gap-md border-t border-border pt-sm">
      <Icon name={turn.status === "failed" ? "warning" : turn.status === "succeeded" ? "check-circle" : "clock"} size="sm" className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-body">{readableText(bundle.messages.find(m=>m.id===turn.userMessageId)?.content ?? W.previousTurn)}</span>
      <StatusBadge tone={turn.status === "failed" ? "warning" : "neutral"} icon={false}>{W.turns[turn.status]}</StatusBadge>
    </div>)}
  </Card>;
}

function ConversationHistory() {
  const { XIAOYU_TEXT: T } = useMessages();
  const { client, bundle, tasks, busy, loading, notesDirty } = useXiaoyu();
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button size="icon-xl" variant="ghost" aria-label={T.history} title={T.history} data-assistant-history>
        <Icon name="list" size="sm" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" width="md" className={styles.history} aria-label={T.history}>
      <h3 className="mb-xs text-label">{T.history}</h3>
      {tasks.length ? <nav className="flex flex-col gap-2xs" aria-label={T.history}>
        {tasks.map(row => <Button key={row.id} variant={bundle?.task.id === row.id ? "secondary" : "ghost"} size="md"
          data-control-size="preserve" className={styles.taskButton} disabled={busy || loading || notesDirty}
          aria-current={bundle?.task.id === row.id ? "true" : undefined}
          onClick={() => { setOpen(false); void client.select(row.id); }}>
          <span className="min-w-0">
            <span className="line-clamp-2 break-words text-body">{readableText(row.goal)}</span>
            <span className="block text-body-small text-muted-foreground">{taskStatus(T, row.status)}</span>
          </span>
        </Button>)}
      </nav> : <p className="text-body-small text-muted-foreground">{T.emptyTasks}</p>}
    </PopoverContent>
  </Popover>;
}

function AgentReply({ children }: { readonly children: ReactNode }) {
  const { XIAOYU_TEXT: T } = useMessages();
  return <div className={styles.reply} data-role="assistant">
    <AgentMark />
    <div className="min-w-0">
      <p className="mb-2xs text-label">{T.name}</p>
      <div className="text-body leading-relaxed">{children}</div>
    </div>
  </div>;
}

type PageTools = { readonly label: string; readonly open: () => void };

function FocusControl() {
  const { XIAOYU_TEXT: T, DOMAIN_LABEL } = useMessages();
  const { client, pageContext, focus, bundle } = useXiaoyu();
  const moduleLabel = pageContext ? DOMAIN_LABEL[pageContext.module] ?? T.currentPage : T.noFocus;
  const label = focus.mode === "none" ? T.noFocus : focus.mode === "manual" ? T.linkedFocus : moduleLabel;
  return <div className={styles.pageContext} data-xiaoyu-focus>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="md" className="min-w-0 max-w-full text-muted-foreground" aria-label={`${T.focus}: ${label}`}>
        <Icon name="map-pin" size="sm" /><span className="truncate">{label}</span><Icon name="chevron-down" size="xs" />
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" width="sm">
        <DropdownMenuItem onSelect={() => client.setFocus({ mode: "auto" })}>{T.followPage}</DropdownMenuItem>
        {pageContext?.object ? <DropdownMenuItem onSelect={() => client.setFocus({ mode: "manual", object: pageContext.object! })}>{T.focusPage}</DropdownMenuItem> : null}
        {bundle?.references.filter(r => r.role === "target").map((r, index) => <DropdownMenuItem key={r.referenceId}
          onSelect={() => client.setFocus({ mode: "manual", object: { kind: r.kind, id: r.id } })}>{T.focusTarget(index + 1)}</DropdownMenuItem>)}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => client.setFocus({ mode: "none" })}>{T.clearFocus}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

function XiaoyuConversation({ full, showResults, labels, outputKey, controls, pageTools }: {
  readonly full: boolean;
  readonly labels: Record<string,string>; readonly showResults: () => void;
  readonly outputKey: string;
  readonly controls?: ReactNode;
  readonly pageTools?: PageTools;
}) {
  const { XIAOYU_TEXT: T, XIAOYU_FORMS:F } = useMessages();
  const { width, toggle } = useAssistantWidth();
  const panel = useAssistantVisibility();
  const s = useXiaoyu();
  const { client, bundle, busy, loading, notesDirty } = s;
  const [showNotes, setShowNotes] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [interrupt, setInterrupt] = useState(false);
  const task = bundle?.task;
  const ended = task?.status === "completed" || task?.status === "cancelled";
  const paused = task?.status === "paused" || bundle?.ruleChanged;
  const running = bundle?.turns.find(t => t.status === "running");
  const frozen = busy || loading || !!running;
  const hasMessages = !!bundle?.messages.length;
  const latestTurn = bundle?.turns.at(-1);
  const failedTurn = !busy && latestTurn?.status === "failed" ? latestTurn : null;
  const failedQuestion = failedTurn && bundle?.messages.find(message => message.id === failedTurn.userMessageId)?.content;

  return <section className={styles.conversation} aria-label={T.conversation} data-xiaoyu-conversation>
    <header className={styles.chatHeader} data-assistant-header>
      {full ? <h2 className={styles.agentTitle}><Icon name="sparkles" size="sm" />{T.name}</h2> : <Link href={workspaceHref(task?.id)} className={styles.agentTitle} title={T.full} aria-label={`${T.name}: ${T.full}`} data-assistant-workbench><Icon name="sparkles" size="sm" /><span>{T.name}</span></Link>}
      <AssistantMode placement="header" />
      <span className="min-w-0 flex-1" />
      <span className={styles.widthControl}><AssistantWidthToggle wide={width === "wide"} onToggle={toggle} /></span>
      <Button size="icon-xl" variant="secondary" className={styles.newChat} aria-label={T.newChat} title={T.newChat}
        disabled={busy || loading || notesDirty} onClick={client.newTask}>
        <Icon name="plus" size="sm" />
      </Button>
      <ConversationHistory />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-xl" variant="ghost" aria-label={T.moreActions} title={T.moreActions} data-assistant-more><Icon name="more-vertical" size="sm" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" width="sm">
          {!full ? <DropdownMenuItem asChild><Link href={workspaceHref(task?.id)} data-assistant-workbench><Icon name="squares-four" size="sm" />{T.full}</Link></DropdownMenuItem> : null}
          {pageTools ? <DropdownMenuItem onSelect={pageTools.open}>{pageTools.label}</DropdownMenuItem> : null}
          <DropdownMenuItem disabled={busy || loading} onSelect={() => void client.refresh()}>
            <Icon name="refresh" size="sm" />{T.refresh}
          </DropdownMenuItem>
          {task ? <>
            <DropdownMenuItem asChild><a href={`/api/copilot/tasks/${task.id}/export`} download><Icon name="download" size="sm" />{T.exportCollaboration}</a></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShowNotes(v => !v)}><Icon name="clipboard" size="sm" />{showNotes ? T.hideNotes : T.openNotes}</DropdownMenuItem>
            {!ended ? <>
              <DropdownMenuItem disabled={frozen || notesDirty} onSelect={() => void client.change(paused
                ? { action: "resume", checkpointId: bundle?.checkpoint?.id }
                : { action: "status", status: "paused" })}>{paused ? T.resume : T.pause}</DropdownMenuItem>
              <DropdownMenuItem disabled={frozen || notesDirty} onSelect={() => void client.change({ action: "status", status: "completed" })}>{T.complete}</DropdownMenuItem>
              <DropdownMenuItem disabled={frozen || notesDirty} onSelect={() => setCancel(true)}>{T.cancel}</DropdownMenuItem>
            </> : null}
          </> : null}
          {full ? <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/copilot?view=proposals">{T.proposals}</Link></DropdownMenuItem>
          </> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {controls ?? <Button size="icon-xl" variant="ghost" aria-label={T.close} title={T.close} data-assistant-close onClick={panel.close}><Icon name="x" size="sm" /></Button>}
    </header>
    <FocusControl />
    <div className={styles.chatBody}>
      <AssistantTranscript key={task?.id ?? "new"} revision={bundle?.messages.length ?? 0} busy={busy}>
        {loading ? <output className="text-body text-muted-foreground">{T.loading}</output> : null}
        {!loading && !hasMessages && !busy ? <div className={styles.greeting}>
          <AgentMark large />
          <h3 className="text-heading-3">{task ? T.readyToDiscuss : T.chatWelcome}</h3>
          <p className="max-w-prose text-body leading-relaxed text-muted-foreground">{task ? T.discussHint : T.chatWelcomeHint}</p>
        </div> : null}
        {bundle?.messages.map(message => message.role === "assistant"
          ? <AgentReply key={message.id}><XiaoyuMarkdown text={message.content} labels={labels} unavailable={F.referenceUnavailable}/></AgentReply>
          : <AssistantMessage key={message.id} role="user"><p className="whitespace-pre-wrap break-words">{readableText(message.content,labels,F.referenceUnavailable)}</p></AssistantMessage>)}
        {busy && s.pending && !bundle?.messages.some(m => m.role === "user" && m.content === s.pending?.question) ? (
          <AssistantMessage role="user"><p className="whitespace-pre-wrap break-words">{readableText(s.pending.question,labels,F.referenceUnavailable)}</p></AssistantMessage>
        ) : null}
        {busy ? <AgentReply><output className="text-body-small text-muted-foreground">{T.thinking}</output></AgentReply> : null}
        {full && outputKey && !busy && !s.error ? <Button variant="ghost" size="md" className="self-start" onClick={showResults}>
          <Icon name="clipboard" size="sm" />{T.viewResults}
        </Button> : null}
        {s.error ? <Banner tone="warning" title={errorText(s.error, T)} /> : null}
        {failedTurn && !s.error && !s.pending ? <Banner tone="warning" title={errorText(failedTurn.errorCode ?? "MODEL_FAILED", T)} /> : null}
        {failedQuestion && !s.pending && !s.input && !frozen && !ended && !paused ? <Button size="xl" variant="secondary" data-control-emphasis="primary" className="self-start"
          onClick={() => client.setInput(failedQuestion)}>{T.restoreQuestion}</Button> : null}
        {bundle?.ruleChanged ? <Banner tone="warning" title={T.ruleChanged} /> : null}
        {(s.pending || s.creation) && !busy ? <Banner tone="warning" title={bundle?.turns.some(t => t.requestId === s.pending?.requestId && t.status !== "running") ? T.failed : T.unknown} /> : null}
        {running && !busy ? <div className="flex flex-wrap items-center gap-sm">
          <p className="text-body-small text-muted-foreground">{T.interrupted}</p>
          <Button variant="secondary" size="md" onClick={() => setInterrupt(true)}>{T.markInterrupted}</Button>
        </div> : null}
        {s.creation && !busy ? <Button size="md" variant="secondary" className="self-start" onClick={() => void client.send()}>{T.recover}</Button> : null}
        {s.pending && !running && !busy ? <Button size="md" variant="secondary" className="self-start" onClick={() => void client.continueAfterFailure()}>{T.recover}</Button> : null}
        {!full ? <><XiaoyuResearch /><XiaoyuFormLinks /></> : null}
      </AssistantTranscript>
      {showNotes && task ? <Card className={styles.notes}>
        <h3 className="text-label">{T.notes}</h3>
        <Textarea value={s.notes} aria-label={T.notes} placeholder={T.notesPlaceholder} maxLength={10000} rows={3}
          disabled={frozen || ended} onChange={e => client.setNotes(e.target.value)} />
        <Button size="md" className="self-end" disabled={!notesDirty || frozen || ended} onClick={() => void client.saveNotes()}>{T.saveNotes}</Button>
      </Card> : null}
    </div>
    <div className={styles.composer}>
      {notesDirty ? <output className="text-body-small text-warning-text">{T.notesUnsaved}</output> : null}
      {ended ? <p className="text-body-small text-muted-foreground">{T.readOnly}</p> : null}
      {paused && !ended && !busy ? <Button size="md" variant="secondary" className="mb-xs"
        disabled={frozen || notesDirty} onClick={() => void client.change({ action: "resume", checkpointId: bundle?.checkpoint?.id })}>{T.resume}</Button> : null}
      <AssistantComposer id={full ? "xiaoyu-full-input" : "xiaoyu-dock-input"} value={s.input}
        onChange={client.setInput} onSend={() => void client.send()} placeholder={T.chatPlaceholder}
        disabled={loading || !!s.creation || ended || paused || !!running} busy={busy} sendDisabled={!!s.pending || notesDirty}
        extra={<XiaoyuInputTools disabled={frozen || !!ended || !!paused || !!s.pending}/>} compact />
    </div>
    {cancel && task ? <ConfirmDestructive open onOpenChange={setCancel} verb={T.cancel} target={readableText(task.goal,labels,F.referenceUnavailable)}
      consequence={T.cancelDescription} onConfirm={() => client.change({ action: "status", status: "cancelled" })} /> : null}
    {interrupt && running ? <ConfirmDestructive open onOpenChange={setInterrupt} verb={T.markInterrupted} target={readableText(task?.goal ?? T.conversationFailed,labels,F.referenceUnavailable)}
      consequence={T.interruptDescription} onConfirm={() => client.change({ action: "interrupt", requestId: running.requestId })} /> : null}
  </section>;
}

export function XiaoyuSurface({ full = false, controls, pageTools, editor }: { readonly editor?: ReactNode; readonly full?: boolean; readonly controls?: ReactNode; readonly pageTools?: PageTools }) {
  const { XIAOYU_TEXT: T } = useMessages();
  const {catalogs}=useXiaoyuCatalog();
  const labels=Object.values(catalogs)[0]?.labels??{};
  const { bundle, recoveryTaskId } = useXiaoyu();
  const [conversationOpen, setConversationOpen] = useState(true);
  const dockRef = useRef<HTMLDivElement>(null);
  useDockSize(dockRef, full);
  useEffect(() => {
    const open = () => { setConversationOpen(true); setMobile("chat"); requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("#xiaoyu-full-input")?.focus()); };
    window.addEventListener("xiaoyu:open-conversation", open);
    return () => window.removeEventListener("xiaoyu:open-conversation", open);
  }, []);
  const { width } = useAssistantWidth();
  const [mobile, setMobile] = useState<"chat" | "board">("chat");
  const [boardJump, setBoardJump] = useState(0);
  const drafts = bundle?.drafts.filter(d => d.contractVersion === "business-form/1").map(d => d.id) ?? [];
  const latest = bundle?.messages.findLast(m => m.role === "assistant");
  const lastTurn = bundle?.turns.at(-1);
  const hasOutput = drafts.length > 0 || !!latest || !!lastTurn || (!!bundle && bundle.task.status !== "active");
  const outputKey = recoveryTaskId ?? (hasOutput ? `${bundle?.task.id}:${drafts.join(",")}:${latest?.id ?? ""}:${lastTurn?.id ?? ""}:${boardJump}` : "");
  const closeControl = full ? <Button size="icon-xl" variant="ghost" aria-label={T.close} title={T.close} data-assistant-close onClick={() => { setConversationOpen(false); setMobile("board"); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-assistant-dock-trigger] button")?.focus()); }}><Icon name="x" size="sm" /></Button> : controls;
  const conversation = <XiaoyuConversation labels={labels} full={full} controls={closeControl} pageTools={pageTools} outputKey={outputKey} showResults={() => { setBoardJump(i => i + 1); setMobile("board"); }} />;
  return <div className={full ? styles.full : styles.dock} data-xiaoyu-surface={full ? "full" : "dock"} data-task-id={bundle?.task.id ?? ""}
    data-conversation-width={width} data-conversation-open={conversationOpen}>
    {full ? <div className={styles.mobileSwitch} role="group" aria-label={T.title}>
      <Button size="md" variant={mobile === "chat" ? "secondary" : "ghost"} aria-pressed={mobile === "chat"} onClick={() => { setMobile("chat"); setConversationOpen(true); }}>
        <Icon name="chat-circle" size="sm" />{T.conversation}
      </Button>
      <Button size="md" variant={mobile === "board" ? "secondary" : "ghost"} aria-pressed={mobile === "board"} onClick={() => setMobile("board")}>
        <Icon name="clipboard" size="sm" />{T.boardLabel}{outputKey ? <span className={styles.resultDot} aria-hidden="true" /> : null}
      </Button>
    </div> : null}
    <div className={styles.panes} data-mobile-view={mobile}>
      {full ? <WorkspaceContent canvas><TaskBoard labels={labels} editor={editor} outputKey={outputKey} />{!conversationOpen ? <Button variant="secondary" size="md" className={styles.reopenConversation} onClick={() => { setConversationOpen(true); setMobile("chat"); }}><Icon name="chat-circle" size="sm" />{T.name}</Button> : null}</WorkspaceContent> : null}
      {full ? <div ref={dockRef} className={styles.conversationDock} data-pane-open={conversationOpen} aria-hidden={!conversationOpen} inert={!conversationOpen}>
        <ShellDock mode={width} className={`${styles.conversationPane} shadow-none`}>{conversation}</ShellDock>
      </div> : conversation}
    </div>
  </div>;
}
