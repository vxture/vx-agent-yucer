"use client";

import { useState } from "react";
import {
  Button, DetailList, DetailRow, Drawer, EmptyState, Icon, Input, Label,
  NativeSelect, Section, SegmentedControl, ShellHeader,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsTrigger, Textarea,
} from "@vxture/design-ui";
import { ShellBrand, ShellIconButton } from "@vxture/design-system";
import { Tag } from "../../(app)/components/tag";
import { PREVIEW_FIXTURES } from "../../(app)/lib/messages";
import { PRODUCT_MARK_SRC } from "../../(app)/lib/brand-assets";
import { TabsList, ViewHeader } from "../../(app)/components/business-controls";

const T = PREVIEW_FIXTURES.progression;
type Task = (typeof T.tasks)[number];
type Plan = { goal: string; expected: string; when: string; person: string };
type Cycle = { cycle: number; plan: Plan | null; note: string };
type Draft = {
  goal: string; expected: string; when: string; person: string;
  confirmed: boolean; note: string; recorded: boolean; analysed: boolean;
  suggestion: boolean; nextGoal: string; plan: Plan | null; cycle: number; previous: Cycle[]; recordedNote: string;
};
type Step = "plan" | "prepare" | "review" | "history";
type Scenario = keyof typeof T.scenarios;
type Filter = "all" | "due" | "feedback" | "blocked" | "unplanned";
const seed = (task: Task): Draft => ({
  goal: task.status === "unplanned" ? "" : task.goal, expected: T.contexts[task.id].expected, when: task.status === "unplanned" ? "" : task.when, person: task.person,
  confirmed: task.status === "feedback", note: "", recorded: false, analysed: false,
  suggestion: false, nextGoal: "", cycle: 1, previous: [], recordedNote: "",
  plan: task.status === "feedback" ? { goal: task.goal, expected: T.contexts[task.id].expected, when: task.when, person: task.person } : null,
});
const filters: Filter[] = ["all", "due", "feedback", "blocked", "unplanned"];
const tones = { ready: "info", due: "danger", feedback: "warning", blocked: "warning", unplanned: "neutral" } as const;

export function ProgressionPreview() {
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [view, setView] = useState("workbench");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("plan");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [source, setSource] = useState<"previous" | "current" | null>(null);
  const [assistant, setAssistant] = useState(false);
  const [rehearsal, setRehearsal] = useState(false);
  const [notice, setNotice] = useState("");
  const task = T.tasks.find((x) => x.id === selected) ?? T.tasks[0];
  const draft = drafts[task.id] ?? seed(task);
  const context = T.contexts[task.id];
  const canAnalyse = scenario !== "denied" && scenario !== "failed";
  const isExample = draft.cycle === 1 && draft.plan?.goal === task.goal && draft.plan.expected === context.expected && draft.note.trim() === context.sample;
  const update = (patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [task.id]: { ...(prev[task.id] ?? seed(task)), ...patch } }));
  const scoped = T.tasks.filter((x) => scope === "team" || x.mine);
  const priority = { due: 0, blocked: 1, feedback: 2, ready: 3, unplanned: 4 };
  const rows = scoped.filter((x) => (view === "roster" || filter === "all" || x.status === filter) && `${x.name} ${x.account} ${x.goal}`.includes(query)).sort((a, b) => priority[a.status] - priority[b.status]);
  const open = (x: Task) => { setSelected(x.id); setStep(x.status === "feedback" ? "review" : "plan"); setNotice(""); };
  const showSource = () => setSource("previous");
  const announce = (text: string) => setNotice(text);

  function reset() {
    setDrafts({}); setSelected(null); setFilter("all"); setQuery(""); setScope("mine");
    setView("workbench"); setScenario("normal"); setNotice(T.resetDone);
  }

  function analyse() {
    if (!draft.note.trim()) { announce(T.noteRequired); return; }
    update({ recorded: true, recordedNote: draft.note, analysed: isExample && canAnalyse && scenario !== "sparse" && scenario !== "conflict" });
    announce(T.recorded);
  }

  function nextCycle() {
    if (!draft.nextGoal.trim()) return;
    update({
      previous: [...draft.previous, { cycle: draft.cycle, plan: draft.plan, note: draft.recordedNote }],
      cycle: draft.cycle + 1, goal: draft.nextGoal, expected: "", when: "", confirmed: false,
      plan: null, note: "", recordedNote: "", recorded: false, analysed: false, suggestion: false, nextGoal: "",
    });
    setStep("plan"); announce(T.nextStarted);
  }

  const scenarioMessage = scenario === "normal" ? null : {
    sparse: [T.sparseTitle, T.sparseText], conflict: [T.conflictTitle, T.conflictText],
    denied: [T.deniedTitle, T.deniedText], failed: [T.failedTitle, T.failedText],
  }[scenario];

  const assistantContent = (scenarioId: string) => (
    <div className="flex h-full flex-col gap-lg">
      <div className="flex items-center justify-between gap-sm">
        <span className="inline-flex items-center gap-xs text-label"><Icon name="sparkles" size="sm" />{T.assistant}</span>
        <Tag tone="neutral">{T.mode}</Tag>
      </div>
      <p className="text-body-small text-muted-foreground">{T.assistantSub}</p>
      <DetailList>
        <DetailRow label={T.assistantScope}>{selected ? task.name : scope === "team" ? T.teamSummary : T.personalSummary}</DetailRow>
        <DetailRow label={T.taskStep}>{selected ? T[step] : T.workbench}</DetailRow>
      </DetailList>
      {scenarioMessage ? (
        <Section title={scenarioMessage[0]}>
          <p className="text-body-small text-muted-foreground">{scenarioMessage[1]}</p>
          {scenario === "failed" ? <Button size="md" variant="outline" onClick={() => setScenario("normal")}>{T.retry}</Button> : null}
        </Section>
      ) : selected ? (
        <Section title={T.assistantAction}>
          <p className="text-body-small">{step === "review" ? context.next : context.strategy}</p>
          <Button size="md" variant="link" onClick={showSource}>{T.originLink}<Icon name="arrow-right" size="xs" /></Button>
          <Button size="xl" variant="outline" onClick={() => { update({ suggestion: true }); setStep("plan"); }}>{T.strategyAction}</Button>
        </Section>
      ) : (
        <Section title={scope === "team" ? T.teamRequest : T.next}>
          <p className="text-body-small">{scope === "team" ? T.supportText : T.mineWhy}</p>
          <Button size="md" variant="outline" onClick={() => open(scope === "team" ? T.tasks[3] : T.tasks[1])}>{T.open}<Icon name="arrow-right" size="xs" /></Button>
        </Section>
      )}
      <div className="mt-auto flex flex-col gap-sm border-t border-dashed border-border pt-lg">
        <Label htmlFor={scenarioId}>{T.scenario}</Label>
        <NativeSelect id={scenarioId} className="h-control-xl" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
          {Object.entries(T.scenarios).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </NativeSelect>
        <p className="text-body-small text-muted-foreground">{T.preview}</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <ShellHeader surface="background" leading={<ShellBrand logoSrc={PRODUCT_MARK_SRC} label={T.brand} tag={T.tagline} labelClassName="text-lg" />}
        trailing={<div className="flex items-center gap-lg"><span className="hidden text-body-small text-muted-foreground sm:block">{T.preview}</span><Button size="md" variant="ghost" onClick={reset}>{T.reset}</Button><ShellIconButton className="xl:hidden" icon="sparkles" label={T.assistantToggle} onClick={() => setAssistant(true)} /></div>} />
      <div className="flex min-h-0 flex-1">
        {selected ? <aside className="hidden w-(--vx-pane-nav) shrink-0 overflow-y-auto border-r border-dashed border-border p-lg min-[1440px]:block">
          <Section title={T.context} icon="info">
            <p className="text-heading-3">{task.name}</p>
            <p className="text-body-small text-muted-foreground">{task.account}</p>
            <DetailList columns={2} className="sm:grid-cols-1">
              <DetailRow label={T.currency}>{task.amount}</DetailRow><DetailRow label={T.winRate}>{task.rate}</DetailRow>
              <DetailRow label={T.stage}>{task.stage}</DetailRow><DetailRow label={T.owner}>{task.owner}</DetailRow>
              <DetailRow label={T.contact}>{task.person}</DetailRow>
            </DetailList>
            <p className="text-body-small text-muted-foreground">{T.commitmentHint}</p>
          </Section>
        </aside> : null}
        <main className={`min-w-0 flex-1 overflow-y-auto px-lg py-lg xl:pr-lg ${selected ? "xl:pl-3xl min-[1440px]:pl-lg" : "xl:pl-3xl"}`}>
          <div className="mx-auto flex max-w-page-xl flex-col gap-xl pb-3xl">
            {selected ? <>
              <div className="flex items-center justify-between gap-sm">
                <Button size="md" variant="ghost" onClick={() => setSelected(null)}><Icon name="arrow-left" size="xs" />{T.back}</Button>
                <span className="text-body-small text-muted-foreground">{task.account}{" \u00b7 "}{task.stage}{" \u00b7 "}{task.owner}</span>
              </div>
              <ViewHeader icon="kanban" title={task.name} description={T.progression}
                secondary={<div className="flex items-center gap-sm"><span className="text-body-small text-muted-foreground">{T.round} {draft.cycle}</span><Tag tone={draft.confirmed ? "success" : "neutral"}>{draft.confirmed ? T.confirmed : T.draft}</Tag></div>} />
              <div className="flex flex-wrap items-center gap-lg min-[1440px]:hidden text-body-small text-muted-foreground">
                <span>{T.currency} {task.amount}</span><span>{T.winRate} {task.rate}</span><span>{T.contact} {task.person}</span>
              </div>
              <Tabs value={step} onValueChange={(value) => setStep(value as Step)}>
                <TabsList aria-label={T.taskStep} className="max-w-full overflow-x-auto">
                  <TabsTrigger value="plan">{T.plan}</TabsTrigger><TabsTrigger value="prepare">{T.prepare}</TabsTrigger>
                  <TabsTrigger value="review">{T.review}</TabsTrigger><TabsTrigger value="history">{T.history}</TabsTrigger>
                </TabsList>
                <TabsContent value="plan" className="mt-xl flex flex-col gap-xl">
                  <Section icon="target" title={T.goalLabel} description={T.strategyWhy}>
                    <Label htmlFor="plan-goal">{T.goal}</Label><Input id="plan-goal" className="h-control-xl" value={draft.goal} onChange={(e) => update({ goal: e.target.value, confirmed: false })} />
                    <div className="grid gap-lg md:grid-cols-2">
                      <div className="flex flex-col gap-xs"><Label htmlFor="plan-person">{T.person}</Label><Input id="plan-person" className="h-control-xl" value={draft.person} onChange={(e) => update({ person: e.target.value, confirmed: false })} /></div>
                      <div className="flex flex-col gap-xs"><Label htmlFor="plan-when">{T.date}</Label><Input id="plan-when" className="h-control-xl" value={draft.when} onChange={(e) => update({ when: e.target.value, confirmed: false })} /></div>
                    </div>
                    <Label htmlFor="plan-expected">{T.expected}</Label><Textarea id="plan-expected" rows={2} value={draft.expected} onChange={(e) => update({ expected: e.target.value, confirmed: false })} placeholder={context.expected} />
                    <p className="text-body-small text-muted-foreground">{T.commitmentHint}</p>
                  </Section>
                  <Section icon="lightbulb" title={T.strategy} action={<Button size="md" variant="outline" disabled={!canAnalyse} onClick={() => update({ suggestion: true })}>{T.strategyAction}</Button>}>
                    {scenarioMessage ? <p className="text-body-small text-muted-foreground">{scenarioMessage[1]}</p> : <p className="text-body-small">{context.strategy}</p>}
                    {draft.suggestion && canAnalyse ? <div className="flex flex-col gap-sm border-l-2 border-primary pl-lg"><Tag tone="info">{T.strategySource}</Tag><p className="text-body-small">{context.strategy}</p><Button size="md" variant="outline" onClick={() => { update({ expected: context.expected }); announce(T.strategyApplied); }}>{T.strategyApply}</Button></div> : null}
                  </Section>
                  <Section icon="book-open" title={T.origin}>
                    <div className="flex flex-wrap items-center justify-between gap-sm text-body-small"><span>{T.rules}{" \u00b7 "}{context.rule}</span><Button size="md" variant="link" onClick={showSource}>{T.originLink}</Button></div>
                  </Section>
                  <div className="flex flex-wrap justify-end gap-sm"><Button size="xl" variant="outline" onClick={() => announce(T.draftSaved)}>{T.saveDraft}</Button><Button size="xl" disabled={!draft.goal.trim() || !draft.person.trim() || !draft.when.trim() || !draft.expected.trim()} onClick={() => { update({ confirmed: true, plan: { goal: draft.goal, expected: draft.expected, person: draft.person, when: draft.when } }); setStep("prepare"); announce(T.published); }}>{T.publish}<Icon name="arrow-right" size="xs" /></Button></div>
                </TabsContent>
                <TabsContent value="prepare" className="mt-xl flex flex-col gap-xl">
                  <Section icon="flag" title={T.goal} description={T.prepareWhy}><p className="text-heading-3">{draft.plan?.goal || draft.goal}</p><p className="text-body-small text-muted-foreground">{draft.plan?.person || draft.person}{" \u00b7 "}{draft.plan?.when || draft.when}</p>{!draft.confirmed ? <p className="text-body-small text-warning-text">{T.notPublished}</p> : null}</Section>
                  <Section icon="users" title={T.participants}><DetailList><DetailRow label={draft.person}>{context.focus}</DetailRow><DetailRow label={context.peer}>{context.peerFocus}</DetailRow></DetailList></Section>
                  <Section icon="list-checks" title={T.agenda}><ol className="ml-lg list-decimal space-y-sm text-body-small">{T.agendaItems.map((x) => <li key={x}>{x}</li>)}</ol></Section>
                  <Section icon="help" title={T.mustAsk}><ul className="ml-lg list-disc space-y-sm text-body-small">{T.askItems.map((x) => <li key={x}>{x}</li>)}</ul></Section>
                  <div className="flex flex-wrap justify-end gap-sm"><Button size="xl" variant="outline" onClick={() => setRehearsal(true)}>{T.rehearsal}</Button><Button size="xl" onClick={() => setStep("review")}>{T.meetingStart}<Icon name="arrow-right" size="xs" /></Button></div>
                </TabsContent>
                <TabsContent value="review" className="mt-xl flex flex-col gap-xl">
                  <Section icon="edit" title={T.note} description={T.recordWhy}>
                    <Label htmlFor="followup-note">{T.note}</Label><Textarea id="followup-note" rows={5} value={draft.note} onChange={(e) => update({ note: e.target.value, recorded: false, analysed: false })} placeholder={T.notePlaceholder} />
                    <div className="flex flex-wrap items-center justify-between gap-sm"><Button size="md" variant="link" onClick={() => update({ note: context.sample, recorded: false, analysed: false })}>{T.useExample}</Button><Button size="xl" disabled={!draft.note.trim()} onClick={analyse}>{T.record}</Button></div>
                    <p className="text-body-small text-muted-foreground">{T.noAuto}</p>{draft.plan ? <DetailList><DetailRow label={T.confirmedTarget}>{draft.plan.goal}</DetailRow><DetailRow label={T.expected}>{draft.plan.expected}</DetailRow></DetailList> : <p className="text-body-small text-muted-foreground">{T.planNeeded}</p>}
                  </Section>
                  {draft.recorded ? scenarioMessage ? <Section title={scenarioMessage[0]}><p className="text-body-small text-muted-foreground">{scenarioMessage[1]}</p>{scenario === "failed" ? <Button size="md" variant="outline" onClick={() => { setScenario("normal"); update({ analysed: isExample }); }}>{T.retry}</Button> : null}</Section> : draft.analysed ? <>
                    <Section icon="scales" title={T.comparison} description={T.illustrative}>
                      <div className="flex flex-col gap-lg">{[[T.goal, T.partial, context.findings[0]], [T.expected, T.unknown, context.findings[1]], [T.mustAsk, T.unknown, context.findings[2]]].map(([title, state, description]) => <div key={title} className="flex flex-col gap-sm border-b border-dashed border-border pb-lg last:border-b-0"><div className="flex flex-wrap items-center justify-between gap-sm"><span className="text-label">{title}</span><Tag tone="neutral">{state}</Tag></div><p className="text-body-small text-muted-foreground">{description}</p><Button size="md" variant="link" onClick={() => setSource("current")}>{T.evidence}<Icon name="external-link" size="xs" /></Button></div>)}</div>
                    </Section>
                    <Section icon="calendar" title={T.nextFocus}><p className="text-body-small">{draft.nextGoal || context.next}</p><Button size="xl" onClick={() => { update({ nextGoal: context.next }); announce(T.nextCopied); }}>{T.nextApply}</Button></Section>
                    {draft.nextGoal ? <Section title={T.nextPending}><Label htmlFor="next-goal">{T.nextPlan}</Label><Textarea id="next-goal" rows={2} value={draft.nextGoal} onChange={(e) => update({ nextGoal: e.target.value })} /><p className="text-body-small text-muted-foreground">{T.beforeAfter}</p><Button size="xl" disabled={!draft.nextGoal.trim()} onClick={nextCycle}>{T.nextStart}<Icon name="arrow-right" size="xs" /></Button></Section> : null}
                  </> : <p className="text-body-small text-muted-foreground">{draft.plan ? T.customAnalysis : T.planNeeded}</p> : null}
                </TabsContent>
                <TabsContent value="history" className="mt-xl flex flex-col gap-xl">
                  <Section icon="clock-counter-clockwise" title={T.history}>
                    {draft.recorded ? <><p className="text-label">{T.savedNote}</p><p className="whitespace-pre-wrap text-body-small">{draft.recordedNote}</p><DetailList><DetailRow label={T.oldPlan}>{draft.plan?.goal || T.awaitingPlan}</DetailRow>{draft.nextGoal ? <DetailRow label={T.nextPlan}>{draft.nextGoal}</DetailRow> : null}</DetailList></> : draft.previous.length ? null : <EmptyState title={T.historyEmpty} description={T.historyHint} />}
                    <Button size="md" variant="link" onClick={showSource}>{T.originLink}</Button>
                    {draft.previous.map((cycle) => <div key={cycle.cycle} className="flex flex-col gap-sm border-t border-dashed border-border pt-lg"><p className="text-label">{T.priorCycle}{" \u00b7 "}{cycle.cycle}</p><p className="text-body-small">{cycle.plan?.goal || T.awaitingPlan}</p><p className="whitespace-pre-wrap text-body-small text-muted-foreground">{cycle.note}</p></div>)}
                  </Section>
                </TabsContent>
              </Tabs>
            </> : <>
              <ViewHeader icon="kanban" title={T.module} description={T.moduleDescription} />
              <Tabs value={view} onValueChange={setView}>
                <TabsList aria-label={T.viewLabel}><TabsTrigger value="roster">{T.roster}</TabsTrigger><TabsTrigger value="workbench">{T.workbench}</TabsTrigger></TabsList>
              </Tabs>
              <div className="flex flex-wrap items-center justify-between gap-lg">
                <SegmentedControl ariaLabel={T.scope} value={scope} onChange={setScope} size="md" items={[{ value: "mine", label: T.mine }, { value: "team", label: T.team }]} />
                <Input className="h-control-xl w-full md:w-(--vx-pane-action)" aria-label={T.search} placeholder={T.search} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <p className="text-body-small text-muted-foreground">{scope === "team" ? T.teamWhy : T.mineWhy}</p>
              {view === "workbench" ? <>
                <div className="flex flex-wrap gap-xl"><span className="text-body-small text-muted-foreground">{T.all} <strong className="ml-xs text-lg text-foreground">{scoped.length}</strong></span>{filters.slice(1).map((key) => <span key={key} className="text-body-small text-muted-foreground">{T[key]}<strong className="ml-xs text-lg text-foreground">{scoped.filter((x) => x.status === key).length}</strong></span>)}</div>
                <SegmentedControl ariaLabel={T.filters} className="max-w-full self-start overflow-x-auto" value={filter} onChange={setFilter} size="md" items={filters.map((value) => ({ value, label: T[value] }))} />
              </> : null}
              {rows.length ? <Table><TableHeader><TableRow><TableHead>{T.task}</TableHead><TableHead>{T.goal}</TableHead><TableHead>{T.when}</TableHead>{scope === "team" ? <TableHead>{T.owner}</TableHead> : null}<TableHead>{T.state}</TableHead><TableHead>{T.action}</TableHead></TableRow></TableHeader><TableBody>{rows.map((x) => <TableRow key={x.id}><TableCell><Button size="md" variant="link" className="px-0 font-medium" onClick={() => open(x)}>{x.name}</Button><p className="text-body-small text-muted-foreground">{x.account}</p></TableCell><TableCell><span className="text-body-small">{x.goal}</span>{scope === "team" && x.support ? <p className="text-body-small text-warning-text">{x.support}</p> : null}</TableCell><TableCell className="whitespace-nowrap text-body-small">{x.when}</TableCell>{scope === "team" ? <TableCell>{x.owner}</TableCell> : null}<TableCell><Tag tone={tones[x.status]}>{T[x.status]}</Tag></TableCell><TableCell><Button size="md" variant="outline" onClick={() => open(x)}>{T.open}</Button></TableCell></TableRow>)}</TableBody></Table> : <EmptyState title={T.empty} description={T.emptyHint} />}
              <p className="text-body-small text-muted-foreground">{T.overdueReason}</p>
            </>}
            <p role="status" aria-label={T.statusAnnouncement} className="text-body-small text-primary">{notice}</p>
          </div>
        </main>
        <aside className="hidden w-(--vx-pane-action) shrink-0 overflow-y-auto border-l border-dashed border-border bg-gradient-to-b from-gradient-card-from to-gradient-card-to p-lg xl:block">{assistantContent("review-scenario")}</aside>
      </div>
      <Drawer open={source !== null} onClose={() => setSource(null)} title={T.sourceTitle} description={T.sourceHint} closeLabel={T.sourceClose} width="md"><div className="flex flex-col gap-lg"><p className="text-body-small text-muted-foreground">{source === "current" ? T.savedNote : draft.previous.length ? T.priorCycle : T.sourceDate}</p><p className="whitespace-pre-wrap text-body">{source === "current" ? draft.recordedNote : draft.previous.at(-1)?.note || context.source}</p></div></Drawer>
      <Drawer open={assistant} onClose={() => setAssistant(false)} title={T.assistant} closeLabel={T.sourceClose} width="sm">{assistantContent("drawer-review-scenario")}</Drawer>
      <Drawer open={rehearsal} onClose={() => setRehearsal(false)} title={T.rehearsalTitle} closeLabel={T.sourceClose} width="md"><div className="flex flex-col gap-xl"><p className="text-label">{T.rehearsalPrompt}</p><p className="text-body">{context.strategy}</p><Tag tone="neutral">{T.preview}</Tag></div></Drawer>
    </div>
  );
}
