"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Banner, Button, Card, DestructiveButton, Icon, StatusBadge, Textarea } from "@vxture/design-ui";
import { AssistantComposer, AssistantMessage, AssistantTranscript } from "./assistant-conversation";
import { useXiaoyu } from "./xiaoyu-provider";
import { useMessages } from "../lib/i18n/provider";
import { pageObject } from "../lib/xiaoyu-client";
import { UUID } from "../../domains/copilot/lib/task-contract";
import type { Dictionary } from "../lib/i18n/dictionary";
import { ViewHeader } from "./business-controls";
import { XiaoyuTopics } from "./xiaoyu-topics";
import { XiaoyuResearch } from "./xiaoyu-research";
import { XiaoyuFormLinks } from "./xiaoyu-form-link";
import styles from "./xiaoyu-workspace.module.css";

function errorText(code: string, t: Dictionary["XIAOYU_TEXT"]) {
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

export function XiaoyuWorkspace({ initialTask }: { readonly initialTask?: string }) {
  const { client, loading, busy, notesDirty } = useXiaoyu();
  const selected = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialTask || !UUID.test(initialTask) || loading || busy || notesDirty || selected.current === initialTask) return;
    selected.current = initialTask;
    void client.select(initialTask);
  }, [client, initialTask, loading, busy, notesDirty]);
  return <XiaoyuSurface full />;
}

export function XiaoyuSurface({ full = false, onNavigate }: { readonly full?: boolean; readonly onNavigate?: () => void }) {
  const { XIAOYU_TEXT: T, XIAOYU_MEMORY: M, XIAOYU_KNOWLEDGE: K, DOMAIN_LABEL } = useMessages();
  const s = useXiaoyu();
  const { client, bundle, tasks, busy, loading } = s;
  const [showTasks, setShowTasks] = useState(full);
  const [showNotes, setShowNotes] = useState(false);
  const path = usePathname();
  const currentObject = pageObject(path);
  const currentLabel = DOMAIN_LABEL[path.split("/")[1]] ?? T.noObject;
  const task = bundle?.task;
  const ended = task?.status === "completed" || task?.status === "cancelled";
  const running = bundle?.turns.find(t => t.status === "running");
  const statusLabel = task ? { active: T.statusActive, paused: T.statusPaused, completed: T.statusCompleted, cancelled: T.statusCancelled }[task.status] : T.noSelection;
  const frozen = busy || loading || !!running;
  const targets = bundle?.references.filter(r => r.role === "target") ?? [];
  return <div className={`${styles.workspace} ${full ? styles.safeEnd : ""}`} data-xiaoyu-surface={full ? "full" : "dock"} data-task-id={task?.id ?? ""}>
    {full ? <ViewHeader className="shrink-0" icon="sparkles" title={T.title} description={T.subtitle} pageActions={{ secondary: <Button variant="ghost" size="md" asChild><Link href="/copilot?view=proposals"><Icon name="clipboard" size="sm" />{T.proposals}</Link></Button> }} /> : null}
    <div className="flex shrink-0 flex-wrap items-center gap-xs">
      <Button variant="ghost" size="md" asChild><Link href="/copilot/memory"><Icon name="lock" size="sm" />{M.title}</Link></Button>
      <Button variant="ghost" size="md" asChild><Link href="/copilot/knowledge"><Icon name="book-open" size="sm" />{K.title}</Link></Button>
      <Button variant="ghost" size="md" onClick={() => setShowTasks(v => !v)} aria-expanded={showTasks}><Icon name="list" size="sm" />{showTasks ? T.hideTasks : T.showTasks}</Button>
      <Button variant="secondary" size="md" disabled={busy || s.notesDirty} onClick={client.newTask}><Icon name="plus" size="sm" />{T.newTask}</Button>
      <Button variant="ghost" size="icon-xl" className="ml-auto" aria-label={T.refresh} title={T.refresh} disabled={loading || busy} onClick={() => void client.refresh()}><Icon name="refresh" size="sm" /></Button>
    </div>
    <div className={styles.layout}>
      {showTasks ? <Card className={styles.tasks} data-xiaoyu-tasks><h2 className="mb-sm text-label text-muted-foreground">{T.recent}</h2>
        {tasks.length ? <nav className="flex flex-col gap-xs" aria-label={T.recent}>{tasks.map(row => <Button key={row.id} variant={task?.id === row.id ? "secondary" : "ghost"} size="md" data-control-size="preserve" className={styles.taskButton} disabled={busy || s.notesDirty} aria-current={task?.id === row.id ? "true" : undefined} onClick={() => { void client.select(row.id); if (!full) setShowTasks(false); }}>
          <span className="min-w-0"><span className="line-clamp-2 break-words text-body">{row.goal}</span><span className="mt-xs block text-body-small text-muted-foreground">{{active:T.statusActive,paused:T.statusPaused,completed:T.statusCompleted,cancelled:T.statusCancelled}[row.status]}</span></span>
        </Button>)}</nav> : <p className="text-body text-muted-foreground">{T.emptyTasks}</p>}
      </Card> : null}
      <section className={styles.conversation} aria-label={T.conversation}>
        <div className={styles.canvas}>
          <div className="flex shrink-0 flex-col gap-sm">
            <div className="flex items-start gap-sm"><Icon name="lock" size="sm" className="mt-2xs shrink-0 text-muted-foreground" /><p className="text-body-small text-muted-foreground">{T.privateScope}</p><StatusBadge tone={ended ? "neutral" : "brand"} icon={false} size="xs" className="ml-auto shrink-0">{statusLabel}</StatusBadge></div>
            {task ? <h2 className="line-clamp-2 break-words text-label-medium" title={task.goal}>{task.goal}</h2> : null}
            {!full ? <div className="flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="map-pin" size="xs" /><span>{T.currentPage}: {currentLabel}</span>{currentObject && task ? <Button variant="ghost" size="md" className="ml-auto" disabled={frozen || ended || s.notesDirty} onClick={() => void client.change({action:"link",object:currentObject})}>{T.linkPage}</Button> : null}</div> : null}
            {targets.length ? <p className="text-body-small text-muted-foreground">{T.targets}: {targets.length}</p> : null}
          </div>
          {full && !task ? <XiaoyuTopics /> : null}
          {s.error ? <Banner tone="warning" title={errorText(s.error, T)} /> : null}
          {s.notesDirty ? <output className="block text-body-small text-warning-text">{T.notesUnsaved}</output> : null}
          {bundle?.ruleChanged ? <Banner tone="warning" title={T.ruleChanged} /> : null}
          {loading || busy || !task || bundle?.messages.length ? <AssistantTranscript flow revision={bundle?.messages.length ?? 0} busy={busy}>
            {loading ? <output className="block text-body text-muted-foreground">{T.loading}</output> : null}
            {!loading && !bundle?.messages.length ? <div className="my-auto flex flex-col items-start gap-md py-xl">
              <Icon name="sparkles" size="lg" className="text-primary" /><h2 className="text-heading-3">{T.welcome}</h2><p className="max-w-prose text-body leading-relaxed text-muted-foreground">{T.welcomeDescription}</p>
              <Button variant="secondary" size="md" onClick={() => client.setInput(T.example)}>{T.strategyHome}</Button>
              <p className="text-body-small text-muted-foreground">{T.startHint}</p>
            </div> : null}
            {bundle?.messages.map(message => <AssistantMessage key={message.id} role={message.role}><p className="whitespace-pre-wrap break-words">{message.content}</p></AssistantMessage>)}
            {busy ? <output className="block text-body-small text-muted-foreground">{T.sending}</output> : null}
            {(s.pending || s.creation) && !busy ? <Banner tone="warning" title={bundle?.turns.some(t => t.requestId === s.pending?.requestId && t.status !== "running") ? T.failed : T.unknown} /> : null}
          </AssistantTranscript> : null}
          {running && !busy ? <div className="flex flex-wrap items-center gap-sm"><p className="text-body-small text-muted-foreground">{T.interrupted}</p><DestructiveButton size="md" confirm={{verb:T.markInterrupted,target:task?.goal ?? T.conversationFailed,consequence:T.interruptDescription,cancelLabel:T.back,onConfirm:() => client.change({action:"interrupt",requestId:running.requestId})}}>{T.markInterrupted}</DestructiveButton></div> : null}
          {s.creation && !busy ? <Button size="md" variant="secondary" onClick={() => void client.send()}>{T.recover}</Button> : null}
          {s.pending && !running && !busy ? <Button size="md" variant="secondary" onClick={() => void client.continueAfterFailure()}>{T.recover}</Button> : null}
          <XiaoyuResearch />
          <XiaoyuFormLinks />
          {task ? <div className="flex shrink-0 flex-wrap items-center gap-xs">
            <Button size="md" variant="ghost" aria-expanded={showNotes} onClick={() => setShowNotes(v => !v)}><Icon name="clipboard" size="sm" />{showNotes ? T.hideNotes : T.openNotes}</Button>
            {!ended ? <><Button size="md" variant="ghost" disabled={frozen || s.notesDirty} onClick={() => void client.change(task.status === "paused" || bundle.ruleChanged ? {action:"resume",checkpointId:bundle.checkpoint?.id} : {action:"status",status:"paused"})}>{task.status === "paused" || bundle.ruleChanged ? T.resume : T.pause}</Button>
            <Button size="md" variant="ghost" disabled={frozen || s.notesDirty} onClick={() => void client.change({action:"status",status:"completed"})}>{T.complete}</Button>
            <DestructiveButton size="md" disabled={frozen || s.notesDirty} confirm={{verb:T.cancel,target:task.goal,consequence:T.cancelDescription,cancelLabel:T.back,onConfirm:() => client.change({action:"status",status:"cancelled"})}}>{T.cancel}</DestructiveButton></> : <p className="text-body-small text-muted-foreground">{T.readOnly}</p>}
          </div> : null}
          {showNotes && task ? <Card className={styles.notes}><div className="mb-sm flex items-center gap-xs"><Icon name="clipboard" size="sm" /><h3 className="text-label">{T.notes}</h3></div><p className="mb-sm text-body-small text-muted-foreground">{T.notesHint}</p><Textarea value={s.notes} aria-label={T.notes} placeholder={T.notesPlaceholder} maxLength={10000} rows={3} disabled={frozen || ended} onChange={e => client.setNotes(e.target.value)} /><div className="mt-sm flex items-center justify-between gap-sm"><span className="text-body-small text-muted-foreground">{s.notes.length}/10000</span><Button size="md" disabled={!s.notesDirty || frozen || ended} onClick={() => void client.saveNotes()}>{T.saveNotes}</Button></div></Card> : null}
          <div className={styles.composer}><AssistantComposer id={full ? "xiaoyu-full-input" : "xiaoyu-dock-input"} value={s.input} onChange={client.setInput} onSend={() => void client.send()} disabled={loading || !!s.creation || ended || task?.status === "paused" || bundle?.ruleChanged || !!running} busy={busy} sendDisabled={!!s.pending || s.notesDirty} placeholder={T.example} />
            <p className="mt-xs text-body-small leading-relaxed text-muted-foreground">{T.phase}</p>
          </div>
          {full ? <nav className="flex shrink-0 flex-wrap gap-xs pb-md" aria-label={T.navigate}><Button variant="ghost" size="md" asChild><Link href="/segment/new" onClick={onNavigate}><Icon name="plus" size="sm" />{T.segmentNew}</Link></Button><Button variant="ghost" size="md" asChild><Link href="/strategy" onClick={onNavigate}>{T.strategyHome}</Link></Button><Button variant="ghost" size="md" asChild><Link href="/catalog" onClick={onNavigate}>{T.products}</Link></Button></nav> : null}
        </div>
      </section>
    </div>
  </div>;
}
