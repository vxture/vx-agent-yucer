"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Banner,
  Button,
  Card,
  Field,
  FieldLabel,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Textarea,
  ViewLayout,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useXiaoyu } from "./xiaoyu-provider";
import { ViewHeader } from "./business-controls";
import type { MemoryKind } from "../../domains/copilot/memory-store";
type Item = {
  id: string;
  text: string | null;
  kind: MemoryKind;
  state: "active" | "stopped";
  revision: number;
  origin: "user" | "model";
  available: boolean;
  taskId: string | null;
  updatedAt: string;
  createdAt: string;
  sources: { kind: string; id: string; version: string }[];
};
type Hit = { taskId: string; messageId: string; content: string };
export function XiaoyuMemory() {
  const { XIAOYU_MEMORY: T } = useMessages(),
    { client, bundle } = useXiaoyu();
  const [items, setItems] = useState<Item[]>([]),
    [offset, setOffset] = useState(0),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [editing, setEditing] = useState<Item | null | undefined>(),
    [text, setText] = useState(""),
    [kind, setKind] = useState<MemoryKind>("decision"),
    [query, setQuery] = useState(""),
    [hits, setHits] = useState<Hit[]>([]);
  const lifetime = useRef(0),
    controller = useRef<AbortController | null>(null),
    createId = useRef<string | null>(null);
  const editor = useRef<Item | null | undefined>(undefined);
  editor.current = editing;
  useEffect(() => {
    const load = () => {
      const generation = ++lifetime.current;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      void fetch(`/api/copilot/memory?offset=${offset}`, {
        cache: "no-store",
        signal: abort.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error("unavailable");
          return r.json();
        })
        .then((r) => {
          if (lifetime.current === generation) {
            setItems(r.items);
            setNextOffset(r.nextOffset);
            setHits([]);
            const old = editor.current;
            if (
              old &&
              !r.items.some(
                (i: Item) =>
                  i.id === old.id && i.available && i.revision === old.revision,
              )
            ) {
              setEditing(undefined);
              setText("");
            }
          }
        })
        .catch(() => {
          if (!abort.signal.aborted && lifetime.current === generation) {
            setItems([]);
            setHits([]);
            setEditing(undefined);
            setText("");
            setError(true);
          }
        });
    };
    load();
    const clear = () => {
      if (document.visibilityState === "hidden") {
        setItems([]);
        setHits([]);
        setEditing(undefined);
        setText("");
        lifetime.current++;
        controller.current?.abort();
        setBusy(false);
      } else {
        load();
      }
    };
    document.addEventListener("visibilitychange", clear);
    const focus = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 30000);
    return () => {
      lifetime.current++;
      controller.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [offset]);
  async function request(path: string, method = "GET", body?: unknown) {
    const generation = lifetime.current;
    const r = await fetch(path, {
      method,
      cache: "no-store",
      signal: controller.current?.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error("unavailable");
    const result = await r.json();
    if (generation !== lifetime.current) throw new Error("scope_changed");
    return result;
  }
  async function act(fn: () => Promise<void>) {
    const generation = lifetime.current;
    setBusy(true);
    setError(false);
    try {
      await fn();
    } catch {
      if (lifetime.current === generation) {
        setError(true);
        setItems([]);
        setHits([]);
        setEditing(undefined);
        setText("");
      }
    } finally {
      if (lifetime.current === generation) setBusy(false);
    }
  }
  const reload = async () => {
    const result = await request(`/api/copilot/memory?offset=${offset}`);
    setItems(result.items);
    setNextOffset(result.nextOffset);
  };
  const save = () =>
    act(async () => {
      if (editing)
        await request(`/api/copilot/memory/${editing.id}`, "PATCH", {
          action: "correct",
          revision: editing.revision,
          text,
          kind,
        });
      else {
        createId.current ??= crypto.randomUUID();
        await request("/api/copilot/memory", "POST", {
          requestId: createId.current,
          text,
          kind,
        });
      }
      createId.current = null;
      setEditing(undefined);
      setText("");
      await reload();
      await client.refresh();
    });
  return (
    <ViewLayout>
      <ViewHeader
        icon="sparkles"
        title={T.title}
        description={T.subtitle}
        pageActions={{
          secondary: (
            <Button variant="ghost" size="md" asChild>
              <Link href="/copilot">{T.back}</Link>
            </Button>
          ),
          primary: (
            <Button
              size="md"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setText("");
                setKind("decision");
                createId.current = null;
              }}
            >
              <Icon name="plus" size="sm" />
              {T.new}
            </Button>
          ),
        }}
      />
      <p className="text-body text-muted-foreground">{T.hint}</p>
      {error ? <Banner tone="warning" title={T.failure} /> : null}
      <Card className="space-y-sm p-lg">
        <div className="flex flex-wrap items-center gap-sm">
          <h2 className="text-label-medium">{T.history}</h2>
          <div className="w-full min-w-0 sm:w-80">
            <Input
              className="w-full"
              value={query}
              maxLength={200}
              placeholder={T.query}
              aria-label={T.history}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button
            size="md"
            variant="secondary"
            disabled={busy || query.trim().length < 2}
            onClick={() =>
              void act(async () => {
                const r = await request(
                  `/api/copilot/memory/history?q=${encodeURIComponent(query)}`,
                );
                setHits(r.items);
              })
            }
          >
            {T.search}
          </Button>
          <Button
            size="md"
            variant="ghost"
            className="ml-auto"
            disabled={busy}
            onClick={() => void act(reload)}
          >
            <Icon name="refresh" size="sm" />
            {T.refresh}
          </Button>
        </div>
        {hits.map((h) => (
          <div
            key={h.messageId}
            className="border-t border-border py-sm text-body"
          >
            <p className="line-clamp-3 whitespace-pre-wrap break-words">
              {h.content}
            </p>
            <Button size="md" variant="ghost" asChild>
              <Link href={`/copilot?task=${h.taskId}`}>{T.openTask}</Link>
            </Button>
          </div>
        ))}
      </Card>
      {editing !== undefined ? (
        <Card className="space-y-md p-lg">
          <Field>
            <FieldLabel htmlFor="memory-text">{T.text}</FieldLabel>
            <Textarea
              id="memory-text"
              value={text}
              maxLength={1200}
              rows={3}
              onChange={(e) => {
                setText(e.target.value);
                createId.current = null;
              }}
            />
            <p className="text-body-small text-muted-foreground">
              {text.length}/1200 &middot; {T.limit}
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="memory-kind">{T.kind}</FieldLabel>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as MemoryKind)}
            >
              <SelectTrigger id="memory-kind" className="max-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    "decision",
                    "inference",
                    "hypothesis",
                    ...(editing?.kind === "fact" ? ["fact"] : []),
                  ] as MemoryKind[]
                ).map((k) => (
                  <SelectItem key={k} value={k}>
                    {T[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex justify-end gap-sm">
            <Button
              size="md"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              {T.cancel}
            </Button>
            <Button
              size="md"
              disabled={busy || !text.trim()}
              onClick={() => void save()}
            >
              {T.save}
            </Button>
          </div>
        </Card>
      ) : null}
      {!items.length && !busy ? (
        <p className="text-body text-muted-foreground">{T.empty}</p>
      ) : null}
      <div className="grid gap-md lg:grid-cols-2">
        {items.map((item) => (
          <Card key={item.id} className="flex flex-col gap-md p-lg">
            <div className="flex items-center gap-sm">
              <StatusBadge
                tone={item.state === "active" ? "brand" : "neutral"}
                size="xs"
                icon={false}
              >
                {T[item.state]}
              </StatusBadge>
              <span className="text-body text-muted-foreground">
                {T[item.kind]}
              </span>
              <span className="ml-auto text-body-small text-muted-foreground">
                {T.revision} {item.revision}
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-body">
              {item.text ?? T.unavailable}
            </p>
            <p className="text-body-small text-muted-foreground">
              {T.source}: {T[item.origin]} &middot; {T.updated}:{" "}
              {new Date(item.updatedAt).toLocaleString()}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-sm">
              {item.taskId && item.available ? (
                <Button size="md" variant="ghost" asChild>
                  <Link href={`/copilot?task=${item.taskId}`}>
                    {T.openTask}
                  </Link>
                </Button>
              ) : null}
              <Button
                size="md"
                variant="ghost"
                disabled={busy || !item.available}
                onClick={() => {
                  setEditing(item);
                  setText(item.text ?? "");
                  setKind(item.kind);
                }}
              >
                {T.edit}
              </Button>
              <Button
                size="md"
                variant="secondary"
                disabled={busy || (!item.available && item.state === "stopped")}
                onClick={() =>
                  void act(async () => {
                    await request(`/api/copilot/memory/${item.id}`, "PATCH", {
                      action: item.state === "active" ? "stop" : "restore",
                      revision: item.revision,
                    });
                    await reload();
                    await client.refresh();
                  })
                }
              >
                {item.state === "active" ? T.stop : T.restore}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <div className="flex justify-end gap-sm">
        {offset > 0 ? (
          <Button
            variant="ghost"
            size="md"
            disabled={busy}
            onClick={() => setOffset(Math.max(0, offset - 500))}
          >
            {T.newer}
          </Button>
        ) : null}
        {nextOffset !== null ? (
          <Button
            variant="secondary"
            size="md"
            disabled={busy}
            onClick={() => setOffset(nextOffset)}
          >
            {T.older}
          </Button>
        ) : null}
      </div>
      {bundle?.task ? (
        <Button
          size="md"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await request(
                `/api/copilot/tasks/${bundle.task.id}/memory`,
                "POST",
              );
              await reload();
            })
          }
        >
          {T.capture}
        </Button>
      ) : null}
    </ViewLayout>
  );
}
