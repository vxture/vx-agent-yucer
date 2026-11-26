"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Banner,
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages, useLocale } from "../lib/i18n/provider";
import { useXiaoyu } from "./xiaoyu-provider";
import type { Judgement } from "../../domains/judgement/lib/judgement";
import { judgementRecordHref } from "../../domains/judgement/lib/record-link";
import { SourceMark } from "./source-mark";
import { StaleMark } from "./stale-mark";
import styles from "./xiaoyu-workspace.module.css";
type Row = {
  absent?: boolean;
  finding: Judgement;
  topicId: string | null;
  revision: number | null;
  taskId: string | null;
  status: string;
};
type Feed = {
  judgements: Row[];
  scope: "mine" | "all";
  scanned: number;
  dataAvailable: boolean;
  daily?: {date:string;generatedAt:string;revalidatedAt:string;changes:number;nextScheduledAt?:string;reused?:boolean}|null;
  pendingUpdate?: boolean;
  observedAt?: string;
};
export function XiaoyuTopics({ compact = false, onDiscuss, daily = false }: {
  readonly compact?: boolean;
  readonly onDiscuss?: () => void;
  readonly daily?: boolean;
}) {
  const { XIAOYU_TOPICS: T, HOME_OVERVIEW_TEXT: H } = useMessages();
  const locale = useLocale();
  const scopeLabels: Record<string, string> = { auto: T.defaultScope, mine: T.mine, all: T.all };
  const params = useSearchParams();
  const { client, notesDirty, busy } = useXiaoyu();
  const [storedFeed, setStoredFeed] = useState<Feed | null>(null),
    [loadedScope, setLoadedScope] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [scope, setScope] = useState(() => ["mine", "all"].includes(params.get("scope") ?? "") ? params.get("scope")! : "auto"),
    [expanded, setExpanded] = useState(false),
    [error, setError] = useState(false),
    [pending, setPending] = useState(false);
  const generation = useRef(0), requestBusy = useRef(false), actionBusy = useRef(false), queuedChange = useRef(false);
  const lastCheck = useRef(0), controller = useRef<AbortController | null>(null);
  const feed = loadedScope === scope ? storedFeed : null;
  const load = useCallback(async (reason: "initial" | "manual" | "activation" | "poll" | "action" = "manual"): Promise<void> => {
    if (requestBusy.current || (actionBusy.current && reason !== "action")) {
      if (reason === "action") queuedChange.current = true;
      return;
    }
    if ((reason === "activation" || reason === "poll") && Date.now() - lastCheck.current < 60000) return;
    const request = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    requestBusy.current = true; setLoading(true);
    const params = new URLSearchParams(scope === "auto" ? {} : { scope });
    const read = async (snapshot: boolean) => {
      if (snapshot) params.set("mode", "snapshot"); else params.delete("mode");
      const r = await fetch(`/api/copilot/topics?${params}`, { cache: "no-store", signal: abort.signal });
      if (!r.ok) throw new Error();
      return await r.json() as Feed;
    };
    try {
      let value = await read(reason === "initial");
      if (request !== generation.current) return;
      setStoredFeed(value); setLoadedScope(scope); setError(false);
      if (value.pendingUpdate) {
        value = await read(false);
        if (request !== generation.current) return;
        setStoredFeed(value);
      }
      lastCheck.current = Date.now();
    } catch {
      if (request === generation.current && !abort.signal.aborted) {
        setStoredFeed(null); setError(true);
      }
    } finally {
      if (request === generation.current) {
        requestBusy.current = false; setLoading(false);
        if (queuedChange.current) { queuedChange.current = false; void load("action"); }
      }
    }
  }, [scope]);
  useEffect(() => {
    setError(false); void load("initial");
    const focus = () => { if (document.visibilityState === "visible") void load("activation"); };
    const changed = () => void load("action");
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("yucer:business-updated", changed);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load("poll"); }, 5 * 60000);
    return () => {
      generation.current++; controller.current?.abort(); requestBusy.current = false; queuedChange.current = false;
      window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("yucer:business-updated", changed); clearInterval(timer);
    };
  }, [load]);
  const act = async (
    row: Row,
    action: "discuss" | "process" | "verify" | "snooze",
  ) => {
    const request = generation.current;
    setPending(true); actionBusy.current = true;
    setError(false);
    try {
      let topicId = row.topicId,
        revision = row.revision;
      if (!topicId || !revision || action === "discuss") {
        const r = await fetch("/api/copilot/topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            judgementId: row.finding.id,
            scope: feed!.scope,
          }),
        });
        if (!r.ok) throw new Error();
        const opened = await r.json();
        if (request !== generation.current) return;
        if (action === "discuss") {
          await client.select(opened.taskId);
          if (client.getSnapshot().bundle?.task.id === opened.taskId) onDiscuss?.();
          return;
        }
        const refreshed = await fetch(
          `/api/copilot/topics?scope=${feed!.scope}`,
          { cache: "no-store" },
        );
        if (!refreshed.ok) throw new Error();
        const next = (await refreshed.json()) as Feed,
          current = next.judgements.find(
            (j) => j.finding.id === row.finding.id,
          );
        topicId = current?.topicId ?? null;
        revision = current?.revision ?? null;
      }
      if (!topicId || !revision) throw new Error();
      const r = await fetch(`/api/copilot/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision }),
      });
      if (!r.ok) throw new Error();
      const result = await r.json();
      if (
        request === generation.current &&
        action === "verify" &&
        result.stillPresent
      )
        setError(true);
      await load("action");
    } catch {
      if (request === generation.current) setError(true);
    } finally {
      setPending(false); actionBusy.current = false;
    }
  };
  const active = feed?.judgements.filter(row => !row.absent && row.status !== "verified") ?? [];
  const counts = { today: active.filter(r => r.finding.urgency === "today").length, week: active.filter(r => r.finding.urgency === "week").length, watch: active.filter(r => r.finding.urgency === "watch").length };
  const verify = feed?.judgements.filter(row => row.status !== "verified" && (row.absent || row.finding.source === "model" || row.finding.freshness?.stale || row.finding.id.startsWith("target-data:"))) ?? [];
  let emptyText: string = T.loading;
  if (feed) emptyText = T.insufficient;
  if (feed?.pendingUpdate) emptyText = T.updating;
  if (error) emptyText = T.unavailable;
  const summary = feed?.dataAvailable ? H.dailyLead(feed.scanned, active.length) : emptyText;
  const pace = feed?.dataAvailable ? H.dailyPace(counts.today, counts.week, counts.watch) : emptyText;
  const hypotheses = feed?.dataAvailable ? H.noHypotheses : emptyText;
  return (
    <section
      className={daily ? styles.todayTopics : "flex flex-col gap-sm"}
      aria-label={daily ? H.today : T.title}
      data-xiaoyu-topics aria-busy={loading}
    >
      {daily ? <header className={`${styles.boardHeader} ${styles.todayHeader}`} data-today-header>
        <h1 className="flex shrink-0 items-center gap-xs text-heading-2"><Icon name="lightbulb" size="sm" />{H.today}</h1>
        <div className={styles.todayStats} aria-label={H.dailyCounts}>
          {(["today", "week", "watch"] as const).map(urgency => <span key={urgency} className={styles.todayStat} data-urgency={urgency} title={T[urgency]}>
            <span className={styles.todayStatLong}>{T[urgency]}</span><span className={styles.todayStatShort}>{T[`${urgency}Short`]}</span><strong>{feed?.dataAvailable ? counts[urgency] : "\u2014"}</strong>
          </span>)}
        </div>
        <div className={styles.todayActions}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="md" variant="ghost" className={styles.scopeTrigger} aria-label={`${T.scope}: ${scopeLabels[scope]}`} title={T.scope} data-today-scope>
              <Icon name="filter" size="sm" className={styles.scopeIcon} /><span>{scopeLabels[scope]}</span><Icon name="chevron-down" size="xs" />
            </Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" width="sm">
              <DropdownMenuRadioGroup value={scope} onValueChange={setScope}>
                <DropdownMenuRadioItem value="auto">{T.defaultScope}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="mine">{T.mine}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="all">{T.all}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="icon-xl" variant="ghost" onClick={() => void load("manual")} disabled={loading || pending} title={T.refreshHint} aria-label={T.refresh}><Icon name="refresh" size="sm" className={loading ? "animate-spin" : undefined} /></Button>
        </div>
      </header> : <div className="flex flex-wrap items-center gap-sm">
        {!compact ? <><Icon name="sparkles" size="sm" /><h2 className="text-heading-3">{T.title}</h2></> : null}
        <span className="text-body-small text-muted-foreground">{T.scopeHint}</span>
        <span className="ml-auto w-36">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger aria-label={T.scope}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{T.defaultScope}</SelectItem>
              <SelectItem value="mine">{T.mine}</SelectItem>
              <SelectItem value="all">{T.all}</SelectItem>
            </SelectContent>
          </Select>
        </span>
        <Button
          size="icon-xl"
          variant="ghost"
          onClick={() => void load("manual")} disabled={loading || pending} title={T.refreshHint}
          aria-label={T.refresh}
        >
          <Icon name="refresh" size="sm" className={loading ? "animate-spin" : undefined} />
        </Button>
      </div>}
      <div className={daily ? styles.boardScroll : "contents"} data-today-content={daily || undefined}>
      {error ? <Banner tone="warning" title={T.unavailable} /> : null}
      {daily && !error ? <>
        <div className={styles.dailySummary} data-daily-summary>
          <h2 className="flex items-center gap-xs text-label"><Icon name="sun" size="sm" />{H.dailySummary}</h2>
          <p className="text-body text-muted-foreground" role="status" aria-live="polite" title={summary}>
            {summary}
          </p>
          {feed && (loading || feed.pendingUpdate) ? <span className="shrink-0 text-body-small text-muted-foreground" data-judgement-updating><Icon name="refresh" size="xs" className="animate-spin inline-block mr-xs" />{feed.pendingUpdate ? T.updating : T.checking}</span> : null}
          {feed?.daily === null ? <span className="shrink-0 text-warning-text" title={H.dailyUnavailable}><Icon name="info" size="sm" aria-label={H.dailyUnavailable} /></span> : null}
          {feed?.daily?.revalidatedAt ? <time dateTime={feed.daily.revalidatedAt} title={`${H.summaryAt} ${new Date(feed.daily.revalidatedAt).toLocaleString(locale, { timeZone: "Asia/Shanghai", timeZoneName: "short" })} / ${T.scheduleHint}`}>{new Date(feed.daily.revalidatedAt).toLocaleTimeString(locale, { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false })}</time> : null}
        </div>
        <h2 className="flex items-center gap-xs text-heading-3"><Icon name="lightbulb" size="sm" />{H.priorities}</h2>
      </> : null}
      {!error && feed?.judgements.length === 0 && !feed.pendingUpdate ? (
        <p className="text-body text-muted-foreground">
          {feed.dataAvailable ? T.none : T.insufficient}
        </p>
      ) : null}
      {(expanded ? feed?.judgements : feed?.judgements.slice(0, 3))?.map(
        (row) => (
          <Card key={row.finding.id} className={`${styles.findingCard} gap-sm p-md`} data-judgement-card style={{ borderTopWidth: "var(--space-2xs)", borderTopColor: row.finding.urgency === "today" ? "var(--warning-border)" : row.finding.urgency === "week" ? "var(--info-border)" : "var(--border)" }}>
            <div className={styles.findingHeader}>
              <Icon name="lightbulb" size="sm" />
              <div className="flex min-w-0 flex-wrap items-center gap-sm">
              <span className="text-label" data-judgement-title>{row.finding.subjectName}</span>
              <StatusBadge
                tone={row.finding.urgency === "today" ? "warning" : "neutral"}
                icon={false}
              >
                {T[row.finding.urgency]}
              </StatusBadge>
              {!row.absent ? <><SourceMark source={row.finding.source} /><StaleMark freshness={row.finding.freshness} /></> : null}
              <span className="ml-auto text-body-small text-muted-foreground">
                {row.status === "verified"
                  ? T.verified
                  : row.absent
                    ? T.pendingVerification
                    : row.status === "processing"
                      ? T.processing
                      : T.open}
              </span>
              </div>
            </div>
            <div className={styles.findingContent}>
            <p className="text-body leading-relaxed" data-judgement-claim>
              {row.absent ? T.noLongerTriggered : row.finding.claim}
            </p>
            <div className="grid grid-cols-1 gap-x-md gap-y-xs text-body text-muted-foreground sm:grid-cols-2">
              {row.finding.facts.map((f, i) => (
                <span key={i}>
                  {f.label}: {f.value}
                </span>
              ))}
            </div>
            <Collapsible>
            <div className={styles.findingFooter} data-judgement-footer>
              {!row.absent ? <CollapsibleTrigger asChild><Button size="md" variant="ghost" className={styles.evidenceTrigger} data-judgement-evidence>
                {T.evidence}<Icon name="chevron-down" size="xs" className={styles.evidenceChevron} />
              </Button></CollapsibleTrigger> : null}
              <Button size="md" variant="outline" asChild className={styles.evidenceSource}>
                <Link data-judgement-evidence-link href={judgementRecordHref(row.finding)}>
                  <Icon name="external-link" size="xs" />{T.source}
                </Link>
              </Button>
              <div className={styles.findingActions} data-judgement-actions>
              {!row.absent ? (
                <>
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={pending || busy || notesDirty || !!feed?.pendingUpdate}
                    onClick={() => void act(row, "discuss")}
                  >
                    {T.discuss}
                  </Button>
                  <Button size="md" variant="ghost" disabled={pending || !!feed?.pendingUpdate} onClick={() => void act(row, "process")}>{T.process}</Button>
                  <Button size="md" variant="ghost" disabled={pending || !!feed?.pendingUpdate} onClick={() => void act(row, "verify")}>{T.verify}</Button>
                </>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-xl" variant="ghost" aria-label={T.moreActions}>
                    <Icon name="more-vertical" size="sm" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" width="sm">
                  {row.absent ? <DropdownMenuItem disabled={pending} onSelect={() => void act(row, "verify")}>
                    <Icon name="check-circle" size="sm" />{T.verify}
                  </DropdownMenuItem> : null}
                  {!row.absent ? <DropdownMenuItem disabled={pending || !!feed?.pendingUpdate} onSelect={() => void act(row, "snooze")}>
                    <Icon name="pause" size="sm" />{T.snooze}
                  </DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
            {!row.absent ? <CollapsibleContent className={styles.findingEvidence} data-judgement-evidence-content>
                <div className={styles.evidenceRule}>
                  <span className="flex items-center gap-xs text-label"><Icon name="list-checks" size="sm" />{T.triggerRule}</span>
                  <p className="text-body text-muted-foreground">{row.finding.rule || T.structuralBasis}</p>
                </div>
                <div className={styles.evidenceRecords}>
                  <h3 className="text-label">{T.recordedEvidence}</h3>
                  {row.finding.citations.length ? row.finding.citations.map(c => (
                    <div key={`${c.kind}:${c.ref ?? c.text}`} className={styles.evidenceRecord}>
                      <div className="flex flex-wrap items-center gap-sm text-body-small text-muted-foreground">
                        <span>{T.evidenceKinds[c.kind]}</span>
                        {c.when ? <time dateTime={new Date(c.when).toISOString()}>{c.kind === "commitment" ? `${T.dueAt} ` : ""}{new Date(c.when).toLocaleDateString(locale, { timeZone: "Asia/Shanghai" })}</time> : null}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-body">{c.text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, T.recordReference)}</p>
                    </div>
                  )) : <p className="text-body text-muted-foreground">{T.structuralBasis}</p>}
                </div>
                <p className="text-body-small text-muted-foreground">{T.evidenceHint}</p>
            </CollapsibleContent> : null}
            </Collapsible>
            </div>
          </Card>
        ),
      )}
      {feed && feed.judgements.length > 3 ? (
        <Button
          size="md"
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? T.less : T.more}
        </Button>
      ) : null}
      {daily ? <div className="grid gap-sm lg:grid-cols-2">
        <Card className="gap-sm p-lg"><h2 className="flex items-center gap-xs text-heading-3"><Icon name="clock" size="sm" />{H.pace}</h2><div className={styles.summaryCardContent}><p className="text-body text-muted-foreground">{pace}</p></div></Card>
        <Card className="gap-sm p-lg"><h2 className="flex items-center gap-xs text-heading-3"><Icon name="info" size="sm" />{H.hypotheses}</h2><div className={styles.summaryCardContent}>
          {verify.length ? <ul className="flex flex-col gap-xs text-body">{verify.slice(0,3).map(row=><li key={row.finding.id} className="line-clamp-2">{row.finding.subjectName}{": "}{row.absent ? T.pendingVerification : row.finding.claim}</li>)}</ul> : <p className="text-body text-muted-foreground">{hypotheses}</p>}
          <p className="text-body-small text-muted-foreground">{H.hypothesisHint}</p>
        </div></Card>
      </div> : null}
      </div>
    </section>
  );
}
