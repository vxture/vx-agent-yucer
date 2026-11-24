"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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

export function XiaoyuWorkspace({ initialTask, today = false }: { readonly initialTask?: string; readonly today?: boolean }) {
  const { client, loading, busy, notesDirty } = useXiaoyu();
  const selected = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialTask || !UUID.test(initialTask) || loading || busy || notesDirty || selected.current === initialTask) return;
    selected.current = initialTask;
    if (client.getSnapshot().bundle?.task.id !== initialTask) void client.select(initialTask);
  }, [client, initialTask, loading, busy, notesDirty]);
  return <XiaoyuSurface full today={today} />;
}

function TodayBoard({ onDiscuss, outputKey, today = false }: {
  readonly onDiscuss: () => void;
  readonly outputKey: string;
  readonly today?: boolean;
}) {
  const { XIAOYU_TEXT: T, HOME_OVERVIEW_TEXT: H } = useMessages();
  const { bundle, busy, recoveryTaskId } = useXiaoyu();
  const view = taskWorkspaceView(bundle);
  const latest = bundle?.messages.find(m => m.id === view.overviewMessageId);
  return <section data-xiaoyu-board className={styles.board} aria-label={T.boardTitle}>
    <header className={styles.boardHeader}>
      <div className="flex min-w-0 flex-1 items-center gap-md">
        <span className="flex shrink-0 items-center gap-sm">
        <Icon name={today ? "lightbulb" : "squares-four"} size="sm" />
        <h1 className="text-heading-2">{today ? H.today : H.workspace}</h1>
        </span>
        {!today && bundle ? <TaskIdentity view={busy && bundle.task.status === "active" ? {...view,stage:"running"} : view} /> : null}
      </div>
      <Button asChild size="md" variant="ghost"><Link href={today ? workspaceHref(bundle?.task.id) : "/copilot/today"} aria-label={today ? H.continueTask : H.today}><span className={styles.sceneLinkLabel}>{today ? H.continueTask : H.today}</span><Icon name="arrow-right" size="sm" /></Link></Button>
    </header>
    <div className={styles.boardScroll} >
      {today ? <XiaoyuTopics compact daily onDiscuss={onDiscuss} /> : outputKey ? <>
        {recoveryTaskId ? <XiaoyuFormLinks /> : null}
        {view.panels.map(panel => panel === "forms" ? <XiaoyuFormLinks key={panel} /> : panel === "sources" ? <XiaoyuResearch key={panel} /> : panel === "activity" ? <TaskActivity key={panel} /> : latest ? <Card key={panel} className="gap-sm p-md">
          <h3 className="flex items-center gap-sm text-label"><Icon name="lightbulb" size="sm" />{T.boardConclusion}</h3>
          <Collapsible key={latest.id}>
            <p className={`${styles.reportPreview} line-clamp-4 whitespace-pre-wrap break-words text-body leading-relaxed`}>{latest.content}</p>
            <CollapsibleContent><p className="mt-sm whitespace-pre-wrap break-words text-body leading-relaxed">{latest.content}</p></CollapsibleContent>
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
      {!today && busy ? <p className="text-body-small text-muted-foreground">{T.boardUpdating}</p> : null}
    </div>
  </section>;
}

function TaskIdentity({ view }: { readonly view: WorkspaceView }) {
  const { bundle } = useXiaoyu();
  const { XIAOYU_WORKSPACE: W } = useMessages();
  return <div className={styles.taskIdentity} role="group" aria-label={W.identity} data-task-identity>
    <span className={styles.taskType}>{W.kinds[view.kind]}</span>
    <span className={styles.taskName} title={bundle?.task.goal}>{bundle?.task.goal}</span>
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
      <span className="min-w-0 flex-1 truncate text-body">{bundle.messages.find(m=>m.id===turn.userMessageId)?.content ?? W.previousTurn}</span>
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
      <Button size="icon-xl" variant="ghost" aria-label={T.history} title={T.history}>
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
            <span className="line-clamp-2 break-words text-body">{row.goal}</span>
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

function XiaoyuConversation({ full, showResults, outputKey, controls, pageTools }: {
  readonly full: boolean;
  readonly showResults: () => void;
  readonly outputKey: string;
  readonly controls?: ReactNode;
  readonly pageTools?: PageTools;
}) {
  const { XIAOYU_TEXT: T } = useMessages();
  const { width, toggle } = useAssistantWidth();
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

  return <section className={styles.conversation} aria-label={T.conversation} data-xiaoyu-conversation>
    <header className={styles.chatHeader} data-assistant-header>
      <h2 className="shrink-0 text-label">{T.name}</h2>
      <AssistantMode placement="header" />
      <span className="min-w-0 flex-1" />
      <ConversationHistory />
      <Button size="icon-xl" variant="secondary" className={styles.newChat} aria-label={T.newChat} title={T.newChat}
        disabled={busy || loading || notesDirty} onClick={client.newTask}>
        <Icon name="plus" size="sm" />
      </Button>
      {controls ?? (full ? <span className={styles.widthControl}><AssistantWidthToggle wide={width === "wide"} onToggle={toggle} /></span> : null)}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-xl" variant="ghost" aria-label={T.moreActions} title={T.moreActions}><Icon name="more-vertical" size="sm" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" width="sm">
          <DropdownMenuItem disabled={busy || loading || notesDirty} onSelect={() => { void client.newTask(); }}><Icon name="plus" size="sm" />{T.newChat}</DropdownMenuItem>
          {!full ? <DropdownMenuItem asChild><Link href={workspaceHref(task?.id)} data-assistant-workbench><Icon name="squares-four" size="sm" />{T.full}</Link></DropdownMenuItem> : null}
          {pageTools ? <DropdownMenuItem onSelect={pageTools.open}>{pageTools.label}</DropdownMenuItem> : null}
          <DropdownMenuItem disabled={busy || loading} onSelect={() => void client.refresh()}>
            <Icon name="refresh" size="sm" />{T.refresh}
          </DropdownMenuItem>
          {task ? <>
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
          ? <AgentReply key={message.id}><p className="whitespace-pre-wrap break-words">{message.content}</p></AgentReply>
          : <AssistantMessage key={message.id} role="user"><p className="whitespace-pre-wrap break-words">{message.content}</p></AssistantMessage>)}
        {busy && s.pending && !bundle?.messages.some(m => m.role === "user" && m.content === s.pending?.question) ? (
          <AssistantMessage role="user"><p className="whitespace-pre-wrap break-words">{s.pending.question}</p></AssistantMessage>
        ) : null}
        {busy ? <AgentReply><output className="text-body-small text-muted-foreground">{T.thinking}</output></AgentReply> : null}
        {full && outputKey && !busy && !s.error ? <Button variant="ghost" size="md" className="self-start" onClick={showResults}>
          <Icon name="clipboard" size="sm" />{T.viewResults}
        </Button> : null}
        {s.error ? <Banner tone="warning" title={errorText(s.error, T)} /> : null}
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
        compact />
    </div>
    {cancel && task ? <ConfirmDestructive open onOpenChange={setCancel} verb={T.cancel} target={task.goal}
      consequence={T.cancelDescription} onConfirm={() => client.change({ action: "status", status: "cancelled" })} /> : null}
    {interrupt && running ? <ConfirmDestructive open onOpenChange={setInterrupt} verb={T.markInterrupted} target={task?.goal ?? T.conversationFailed}
      consequence={T.interruptDescription} onConfirm={() => client.change({ action: "interrupt", requestId: running.requestId })} /> : null}
  </section>;
}

export function XiaoyuSurface({ full = false, controls, pageTools, today = false }: { readonly full?: boolean; readonly controls?: ReactNode; readonly pageTools?: PageTools; readonly today?: boolean }) {
  const { XIAOYU_TEXT: T } = useMessages();
  const { bundle, recoveryTaskId, client } = useXiaoyu();
  const router = useRouter();
  const { width } = useAssistantWidth();
  const [mobile, setMobile] = useState<"chat" | "board">(today ? "board" : "chat");
  const [boardJump, setBoardJump] = useState(0);
  const drafts = bundle?.drafts.filter(d => d.contractVersion === "business-form/1").map(d => d.id) ?? [];
  const latest = bundle?.messages.findLast(m => m.role === "assistant");
  const lastTurn = bundle?.turns.at(-1);
  const hasOutput = drafts.length > 0 || !!latest || !!lastTurn || (!!bundle && bundle.task.status !== "active");
  const outputKey = recoveryTaskId ?? (hasOutput ? `${bundle?.task.id}:${drafts.join(",")}:${latest?.id ?? ""}:${lastTurn?.id ?? ""}:${boardJump}` : "");
  const conversation = <XiaoyuConversation full={full} controls={controls} pageTools={pageTools} outputKey={outputKey} showResults={() => { setBoardJump(i => i + 1); setMobile("board"); }} />;
  return <div className={full ? styles.full : styles.dock} data-xiaoyu-surface={full ? "full" : "dock"} data-task-id={bundle?.task.id ?? ""}
    data-conversation-width={width}>
    {full ? <div className={styles.mobileSwitch} role="group" aria-label={T.title}>
      <Button size="md" variant={mobile === "chat" ? "secondary" : "ghost"} aria-pressed={mobile === "chat"} onClick={() => setMobile("chat")}>
        <Icon name="chat-circle" size="sm" />{T.conversation}
      </Button>
      <Button size="md" variant={mobile === "board" ? "secondary" : "ghost"} aria-pressed={mobile === "board"} onClick={() => setMobile("board")}>
        <Icon name="clipboard" size="sm" />{T.boardLabel}{outputKey ? <span className={styles.resultDot} aria-hidden="true" /> : null}
      </Button>
    </div> : null}
    <div className={styles.panes} data-mobile-view={mobile}>
      {full ? <WorkspaceContent canvas><TodayBoard today={today} outputKey={outputKey} onDiscuss={() => { setMobile("chat"); if (today) router.push(workspaceHref(client.getSnapshot().bundle?.task.id)); }} /></WorkspaceContent> : null}
      {full ? <ShellDock mode={width} className={`${styles.conversationPane} shadow-none`}>
        {conversation}
      </ShellDock> : conversation}
    </div>
  </div>;
}
