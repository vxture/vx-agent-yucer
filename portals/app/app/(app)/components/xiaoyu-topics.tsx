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
  daily?: {date:string;generatedAt:string;revalidatedAt:string;changes:number}|null;
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
  const [feed, setFeed] = useState<Feed | null>(null),
    [scope, setScope] = useState(() => ["mine", "all"].includes(params.get("scope") ?? "") ? params.get("scope")! : "auto"),
    [expanded, setExpanded] = useState(false),
    [error, setError] = useState(false),
    [pending, setPending] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const r = await fetch(
        `/api/copilot/topics${scope !== "auto" ? `?scope=${scope}` : ""}`,
        { cache: "no-store" },
      );
      if (!r.ok) throw Error();
      const value = (await r.json()) as Feed;
      if (request === generation.current) {
        setFeed(value);
        setError(false);
      }
    } catch {
      if (request === generation.current) {
        setFeed(null);
        setError(true);
      }
    }
  }, [scope]);
  useEffect(() => {
    void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 30000);
    return () => {
      generation.current++;
      window.removeEventListener("focus", focus);
      clearInterval(timer);
    };
  }, [load]);
  const act = async (
    row: Row,
    action: "discuss" | "process" | "verify" | "snooze",
  ) => {
    const request = generation.current;
    setPending(true);
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
        if (!r.ok) throw Error();
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
        if (!refreshed.ok) throw Error();
        const next = (await refreshed.json()) as Feed,
          current = next.judgements.find(
            (j) => j.finding.id === row.finding.id,
          );
        topicId = current?.topicId ?? null;
        revision = current?.revision ?? null;
      }
      if (!topicId || !revision) throw Error();
      const r = await fetch(`/api/copilot/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision }),
      });
      if (!r.ok) throw Error();
      const result = await r.json();
      if (
        request === generation.current &&
        action === "verify" &&
        result.stillPresent
      )
        setError(true);
      await load();
    } catch {
      if (request === generation.current) setError(true);
    } finally {
      setPending(false);
    }
  };
  const active = feed?.judgements.filter(row => !row.absent && row.status !== "verified") ?? [];
  const counts = { today: active.filter(r => r.finding.urgency === "today").length, week: active.filter(r => r.finding.urgency === "week").length, watch: active.filter(r => r.finding.urgency === "watch").length };
  const verify = feed?.judgements.filter(row => row.status !== "verified" && (row.absent || row.finding.source === "model" || row.finding.freshness?.stale || row.finding.id.startsWith("target-data:"))) ?? [];
  return (
    <section
      className={daily ? styles.todayTopics : "flex flex-col gap-sm"}
      aria-label={daily ? H.today : T.title}
      data-xiaoyu-topics
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
          <Button size="icon-xl" variant="ghost" onClick={() => void load()} aria-label={T.refresh}><Icon name="refresh" size="sm" /></Button>
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
          onClick={() => void load()}
          aria-label={T.refresh}
        >
          <Icon name="refresh" size="sm" />
        </Button>
      </div>}
      <div className={daily ? styles.boardScroll : "contents"} data-today-content={daily || undefined}>
      {error ? <Banner tone="warning" title={T.unavailable} /> : null}
      {daily && !error ? <>
        <div className={styles.dailySummary} data-daily-summary>
          <h2 className="flex items-center gap-xs text-label"><Icon name="sun" size="sm" />{H.dailySummary}</h2>
          <p className="text-body text-muted-foreground" title={feed?.dataAvailable ? H.dailyLead(feed.scanned, active.length) : T.insufficient}>{feed?.dataAvailable ? H.dailyLead(feed.scanned, active.length) : T.insufficient}</p>
          {feed?.daily === null ? <span className="shrink-0 text-warning-text" title={H.dailyUnavailable}><Icon name="info" size="sm" aria-label={H.dailyUnavailable} /></span> : null}
          {feed?.observedAt ? <time dateTime={feed.observedAt} title={`${H.summaryAt} ${new Date(feed.observedAt).toLocaleString(locale)}`}>{new Date(feed.observedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false })}</time> : null}
        </div>
        <h2 className="flex items-center gap-xs text-heading-3"><Icon name="lightbulb" size="sm" />{H.priorities}</h2>
      </> : null}
      {!error && feed?.judgements.length === 0 ? (
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
              <div className={styles.findingActions} data-judgement-actions>
              {!row.absent ? (
                <>
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={pending || busy || notesDirty}
                    onClick={() => void act(row, "discuss")}
                  >
                    {T.discuss}
                  </Button>
                  <Button size="md" variant="ghost" disabled={pending} onClick={() => void act(row, "process")}>{T.process}</Button>
                  <Button size="md" variant="ghost" disabled={pending} onClick={() => void act(row, "verify")}>{T.verify}</Button>
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
                  {!row.absent ? <DropdownMenuItem disabled={pending} onSelect={() => void act(row, "snooze")}>
                    <Icon name="pause" size="sm" />{T.snooze}
                  </DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
            {!row.absent ? <CollapsibleContent className={styles.findingEvidence} data-judgement-evidence-content>
                <p className="mt-sm text-muted-foreground">
                  {row.finding.rule}
                </p>
                {row.finding.citations.map((c, i) => (
                  <p key={i} className="mt-xs whitespace-pre-wrap break-words">
                    {c.text}
                  </p>
                ))}
                <Link
                  data-judgement-evidence-link className="mt-sm inline-block text-primary"
                  href={
                    row.finding.subjectType === "team"
                      ? "/planning"
                      : `/${row.finding.subjectType === "opportunity" ? "pipeline" : "account"}/${row.finding.subjectId}`
                  }
                >
                  {T.source}
                </Link>
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
        <Card className="gap-sm p-lg"><h2 className="flex items-center gap-xs text-heading-3"><Icon name="clock" size="sm" />{H.pace}</h2><div className={styles.summaryCardContent}><p className="text-body text-muted-foreground">{feed?.dataAvailable ? H.dailyPace(counts.today,counts.week,counts.watch) : T.insufficient}</p></div></Card>
        <Card className="gap-sm p-lg"><h2 className="flex items-center gap-xs text-heading-3"><Icon name="info" size="sm" />{H.hypotheses}</h2><div className={styles.summaryCardContent}>
          {verify.length ? <ul className="flex flex-col gap-xs text-body">{verify.slice(0,3).map(row=><li key={row.finding.id} className="line-clamp-2">{row.finding.subjectName}{": "}{row.absent ? T.pendingVerification : row.finding.claim}</li>)}</ul> : <p className="text-body text-muted-foreground">{feed?.dataAvailable ? H.noHypotheses : T.insufficient}</p>}
          <p className="text-body-small text-muted-foreground">{H.hypothesisHint}</p>
        </div></Card>
      </div> : null}
      </div>
    </section>
  );
}
