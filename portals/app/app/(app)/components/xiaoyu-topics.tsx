"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Banner,
  Button,
  Card,
  Icon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useXiaoyu } from "./xiaoyu-provider";
import type { Judgement } from "../../domains/judgement/lib/judgement";
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
};
export function XiaoyuTopics() {
  const { XIAOYU_TOPICS: T } = useMessages();
  const { client, notesDirty, busy } = useXiaoyu();
  const [feed, setFeed] = useState<Feed | null>(null),
    [scope, setScope] = useState("auto"),
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
  return (
    <section
      className="flex flex-col gap-md"
      aria-label={T.title}
      data-xiaoyu-topics
    >
      <div className="flex flex-wrap items-center gap-sm">
        <Icon name="sparkles" size="sm" />
        <h2 className="text-heading-3">{T.title}</h2>
        <span className="text-body-small text-muted-foreground">
          {T.scopeHint}
        </span>
        <span className="ml-auto w-40">
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
          size="md"
          variant="ghost"
          onClick={() => void load()}
          aria-label={T.refresh}
        >
          <Icon name="refresh" size="sm" />
        </Button>
      </div>
      {error ? <Banner tone="warning" title={T.unavailable} /> : null}
      {!error && feed?.judgements.length === 0 ? (
        <p className="text-body text-muted-foreground">
          {feed.dataAvailable ? T.none : T.insufficient}
        </p>
      ) : null}
      {(expanded ? feed?.judgements : feed?.judgements.slice(0, 3))?.map(
        (row) => (
          <Card key={row.finding.id} className="p-md">
            <div className="flex flex-wrap items-center gap-sm">
              <Icon name="lightbulb" size="sm" />
              <span className="text-label">{row.finding.subjectName}</span>
              <StatusBadge
                tone={row.finding.urgency === "today" ? "warning" : "neutral"}
                icon={false}
              >
                {T[row.finding.urgency]}
              </StatusBadge>
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
            <p className="my-sm text-body">
              {row.absent ? T.noLongerTriggered : row.finding.claim}
            </p>
            <div className="flex flex-wrap gap-md text-body-small text-muted-foreground">
              {row.finding.facts.map((f, i) => (
                <span key={i}>
                  {f.label}: {f.value}
                </span>
              ))}
            </div>
            {!row.absent ? (
              <details className="mt-sm text-body-small">
                <summary className="cursor-pointer text-muted-foreground">
                  {T.evidence}
                </summary>
                <p className="mt-sm text-muted-foreground">
                  {row.finding.rule}
                </p>
                {row.finding.citations.map((c, i) => (
                  <p key={i} className="mt-xs whitespace-pre-wrap break-words">
                    {c.text}
                  </p>
                ))}
                <Link
                  className="mt-sm inline-block text-primary"
                  href={
                    row.finding.subjectType === "team"
                      ? "/planning"
                      : `/${row.finding.subjectType === "opportunity" ? "pipeline" : "account"}/${row.finding.subjectId}`
                  }
                >
                  {T.source}
                </Link>
              </details>
            ) : null}
            <div className="mt-md flex flex-wrap gap-xs">
              {!row.absent ? (
                <>
                  <Button
                    size="md"
                    disabled={pending || busy || notesDirty}
                    onClick={() => void act(row, "discuss")}
                  >
                    {T.discuss}
                  </Button>
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => void act(row, "process")}
                  >
                    {T.process}
                  </Button>
                </>
              ) : null}
              <Button
                size="md"
                variant="ghost"
                disabled={pending}
                onClick={() => void act(row, "verify")}
              >
                {T.verify}
              </Button>
              {!row.absent ? (
                <Button
                  size="md"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => void act(row, "snooze")}
                >
                  {T.snooze}
                </Button>
              ) : null}
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
    </section>
  );
}
