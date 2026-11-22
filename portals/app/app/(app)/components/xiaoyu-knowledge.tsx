"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  Card,
  Checkbox,
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
import { MemberName } from "../lib/member-names";
import { useXiaoyu } from "./xiaoyu-provider";
import { ViewHeader } from "./business-controls";
import type { MemoryKind } from "../../domains/copilot/memory-store";
type Item = {
  id: string;
  revision: number;
  title: string;
  text: string;
  kind: MemoryKind;
  state: "active" | "stopped";
  audience: "workspace" | "members";
  memberSubs: string[];
  sources: { kind: string; id: string; version: string }[];
  updatedAt: string;
  canManage: boolean;
  actorSub: string;
};
type Member = { sub: string; displayName: string | null };
type Preview = {
  title: string;
  text: string;
  kind: MemoryKind;
  audience: string;
  memberSubs: string[];
  reviewedDigest: string;
  sources: Item["sources"];
};
async function request(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`/api/copilot/knowledge${path}`, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error("request_refused");
  return r.json();
}
export function XiaoyuKnowledge() {
  const { XIAOYU_KNOWLEDGE: T, XIAOYU_MEMORY: M } = useMessages(),
    { bundle } = useXiaoyu();
  const [items, setItems] = useState<Item[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null);
  const [editing, setEditing] = useState<Item | null | undefined>(),
    [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [kind, setKind] = useState<MemoryKind>("decision");
  const [audience, setAudience] = useState<"workspace" | "members">(
      "workspace",
    ),
    [members, setMembers] = useState<Member[]>([]),
    [memberQuery, setMemberQuery] = useState(""),
    [results, setResults] = useState<Member[]>([]);
  const [objects, setObjects] = useState<{ kind: string; id: string }[]>([]),
    [review, setReview] = useState<Preview | null>(null),
    [reviewed, setReviewed] = useState(false);
  const generation = useRef(0),
    requestId = useRef("");
  const load = useCallback(async () => {
    const id = ++generation.current;
    try {
      const v = await request(`?offset=${offset}`);
      if (id === generation.current) {
        setItems(v.items);
        setNext(v.nextOffset);
        setError(false);
      }
    } catch {
      setItems([]);
      setError(true);
    }
  }, [offset]);
  useEffect(() => {
    const id = ++generation.current,
      controller = new AbortController();
    void fetch(`/api/copilot/knowledge?offset=${offset}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("refused");
        return r.json();
      })
      .then((v) => {
        if (generation.current === id) {
          setItems(v.items);
          setNext(v.nextOffset);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    // A hidden/background tab never retains source text across a recheck.
    const blur = () => {
      generation.current++;
      setItems([]);
      setEditing(undefined);
      setReview(null);
      setText("");
      setTitle("");
      setMembers([]);
      setResults([]);
      setObjects([]);
      setReviewed(false);
    };
    const focus = () => {
      void load();
    };
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      controller.abort();
      generation.current++;
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
    };
  }, [offset, load]);
  async function call(path: string, method = "GET", body?: unknown) {
    const id = generation.current;
    const value = await request(path, method, body);
    if (id !== generation.current) throw new Error("view_changed");
    return value;
  }
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await fn();
    } catch {
      setReview(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  function edit(r: Item | null) {
    setEditing(r);
    setTitle(r?.title ?? "");
    setText(r?.text ?? "");
    setKind(r?.kind ?? "decision");
    setAudience(r?.audience ?? "workspace");
    setMembers(
      (r?.memberSubs ?? []).map((sub) => ({ sub, displayName: null })),
    );
    setObjects((r?.sources ?? []).map(({ kind, id }) => ({ kind, id })));
    setReview(null);
    setReviewed(false);
    requestId.current = crypto.randomUUID();
  }
  function payload() {
    return {
      title,
      text,
      kind,
      audience,
      memberSubs: audience === "members" ? members.map((m) => m.sub) : [],
      objects,
      businessOnly: true,
    };
  }
  const disabled =
    busy ||
    !title.trim() ||
    !text.trim() ||
    !reviewed ||
    (audience === "members" && !members.length);
  return (
    <ViewLayout>
      <ViewHeader
        title={T.title}
        icon="book-open"
        description={T.description}
        pageActions={{
          primary: (
            <Button size="md" disabled={busy} onClick={() => edit(null)}>
              <Icon name="plus" size="sm" />
              {T.add}
            </Button>
          ),
          secondary: (
            <Button variant="ghost" size="md" asChild>
              <Link href="/copilot">{M.back}</Link>
            </Button>
          ),
        }}
      />
      {error ? <Banner tone="warning" title={T.error} /> : null}
      <Banner tone="info" title={T.boundary} />
      {editing !== undefined ? (
        <Card className="space-y-md p-lg">
          <h2 className="text-heading-3">{editing ? T.edit : T.add}</h2>
          <Field>
            <FieldLabel required htmlFor="knowledge-title">
              {T.name}
            </FieldLabel>
            <Input
              id="knowledge-title"
              value={title}
              maxLength={100}
              disabled={busy}
              onChange={(e) => {
                setTitle(e.target.value);
                setReview(null);
              }}
            />
            <span className="text-body-small text-muted-foreground">
              {title.length}/100
            </span>
          </Field>
          <Field>
            <FieldLabel required htmlFor="knowledge-content">
              {T.content}
            </FieldLabel>
            <Textarea
              id="knowledge-content"
              value={text}
              maxLength={4000}
              rows={4}
              disabled={busy}
              onChange={(e) => {
                setText(e.target.value);
                setReview(null);
              }}
            />
            <span className="text-body-small text-muted-foreground">
              {text.length}/4000
            </span>
          </Field>
          <div className="grid gap-md sm:grid-cols-2">
            <Field>
              <FieldLabel>{M.kind}</FieldLabel>
              <Select
                value={kind}
                disabled={busy}
                onValueChange={(v) => {
                  setKind(v as MemoryKind);
                  setReview(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    ["fact", "decision", "inference", "hypothesis"] as const
                  ).map((v) => (
                    <SelectItem key={v} value={v}>
                      {M[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{T.scope}</FieldLabel>
              <Select
                value={audience}
                disabled={busy}
                onValueChange={(v) => {
                  setAudience(v as typeof audience);
                  setReview(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">{T.workspace}</SelectItem>
                  <SelectItem value="members">{T.members}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {audience === "members" ? (
            <div className="space-y-sm">
              <div className="flex items-center gap-sm">
                <div className="min-w-0 flex-1">
                  <Input
                    aria-label={T.findMembers}
                    value={memberQuery}
                    maxLength={100}
                    placeholder={T.findMembers}
                    onChange={(e) => setMemberQuery(e.target.value)}
                  />
                </div>
                <Button
                  size="md"
                  variant="secondary"
                  disabled={busy || !memberQuery.trim()}
                  onClick={() =>
                    void action(async () => {
                      setResults(
                        (
                          await call(
                            `/members?q=${encodeURIComponent(memberQuery)}`,
                          )
                        ).items,
                      );
                    })
                  }
                >
                  {M.search}
                </Button>
              </div>
              <div className="flex flex-wrap gap-sm">
                {results.map((m) => (
                  <Button
                    key={m.sub}
                    size="md"
                    variant="secondary"
                    disabled={members.some((x) => x.sub === m.sub) || busy}
                    onClick={() => {
                      setMembers([...members, m]);
                      setReview(null);
                    }}
                  >
                    {m.displayName ?? m.sub}
                    <Icon name="plus" size="xs" />
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-sm">
                {members.map((m) => (
                  <Button
                    key={m.sub}
                    size="md"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setMembers(members.filter((x) => x.sub !== m.sub));
                      setReview(null);
                    }}
                  >
                    {m.displayName ?? m.sub}
                    <Icon name="x" size="xs" />
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {!editing && bundle?.references.length ? (
            <Field>
              <FieldLabel>{T.sources}</FieldLabel>
              <p className="text-body-small text-muted-foreground">
                {T.sourcesHint}
              </p>
              <div className="flex flex-wrap gap-md">
                {bundle.references
                  .filter(
                    (r, i, all) =>
                      all.findIndex(
                        (x) => x.kind === r.kind && x.id === r.id,
                      ) === i,
                  )
                  .map((r) => (
                    <label
                      key={`${r.kind}:${r.id}`}
                      className="flex items-center gap-sm text-body"
                    >
                      <Checkbox
                        checked={objects.some(
                          (o) => o.kind === r.kind && o.id === r.id,
                        )}
                        disabled={busy}
                        onCheckedChange={(yes) => {
                          setObjects(
                            yes
                              ? [...objects, { kind: r.kind, id: r.id }]
                              : objects.filter(
                                  (o) => o.kind !== r.kind || o.id !== r.id,
                                ),
                          );
                          setReview(null);
                        }}
                      />
                      {r.kind} {r.id.slice(0, 8)}
                    </label>
                  ))}
              </div>
            </Field>
          ) : null}
          <label className="flex items-start gap-sm text-body">
            <Checkbox
              checked={reviewed}
              disabled={busy}
              onCheckedChange={(v) => setReviewed(v === true)}
            />
            {T.reviewOnly}
          </label>
          {review ? (
            <Card className="space-y-sm p-md">
              <div className="flex flex-wrap items-center gap-sm">
                <Icon name="eye" size="sm" />
                <h3 className="text-label">{T.preview}</h3>
                <StatusBadge tone="neutral" icon={false}>
                  {review.audience === "workspace"
                    ? T.workspace
                    : `${T.members} (${review.memberSubs.length})`}
                </StatusBadge>
              </div>
              <p className="text-label">{review.title}</p>
              <p className="whitespace-pre-wrap break-words text-body">
                {review.text}
              </p>
              <p className="text-body-small text-muted-foreground">
                {T.previewNote}
              </p>
            </Card>
          ) : null}
          <div className="flex flex-wrap justify-end gap-sm">
            <Button
              size="md"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              {M.cancel}
            </Button>
            <Button
              size="md"
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                void action(async () => {
                  if (editing) {
                    await call(`/${editing.id}`, "PATCH", {
                      revision: editing.revision,
                      action: "correct",
                      title,
                      text,
                      kind,
                      audience,
                      memberSubs:
                        audience === "members" ? members.map((m) => m.sub) : [],
                    });
                    setEditing(undefined);
                    await load();
                  } else setReview(await call("/preview", "POST", payload()));
                })
              }
            >
              {editing ? M.save : T.preview}
            </Button>
            {review && !editing ? (
              <Button
                size="md"
                disabled={disabled}
                onClick={() =>
                  void action(async () => {
                    await call("", "POST", {
                      ...payload(),
                      requestId: requestId.current,
                      reviewedDigest: review.reviewedDigest,
                    });
                    setEditing(undefined);
                    setReview(null);
                    await load();
                  })
                }
              >
                {T.share}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}
      <div className="grid items-start gap-md lg:grid-cols-2">
        {items.map((r) => (
          <KnowledgeCard
            key={r.id}
            r={r}
            busy={busy}
            onEdit={edit}
            onToggle={(r) =>
              void action(async () => {
                await call(`/${r.id}`, "PATCH", {
                  revision: r.revision,
                  action: r.state === "active" ? "stop" : "restore",
                });
                await load();
              })
            }
          />
        ))}
      </div>
      {!items.length && !error ? (
        <p className="text-body text-muted-foreground">{T.empty}</p>
      ) : null}
      <div className="flex justify-end gap-sm">
        <Button
          size="md"
          variant="ghost"
          disabled={busy || !offset}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          {T.newer}
        </Button>
        <Button
          size="md"
          variant="ghost"
          disabled={busy || next === null}
          onClick={() => setOffset(next!)}
        >
          {T.older}
        </Button>
      </div>
    </ViewLayout>
  );
}

function KnowledgeCard({
  r,
  busy,
  onEdit,
  onToggle,
}: {
  readonly r: Item;
  readonly busy: boolean;
  readonly onEdit: (r: Item) => void;
  readonly onToggle: (r: Item) => void;
}) {
  const { XIAOYU_KNOWLEDGE: T, XIAOYU_MEMORY: M } = useMessages();
  return (
    <Card className="min-w-0 space-y-md p-lg">
      <div className="flex items-center gap-sm">
        <Icon name="book-open" size="sm" />
        <h2 className="min-w-0 flex-1 truncate text-label-medium">{r.title}</h2>
        <StatusBadge
          tone={r.state === "active" ? "brand" : "neutral"}
          icon={false}
        >
          {r.state === "active" ? M.active : M.stopped}
        </StatusBadge>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-body">
        {r.text}
      </p>
      <div className="flex flex-wrap gap-md text-body-small text-muted-foreground">
        <span>{M[r.kind]}</span>
        <span>
          {r.audience === "workspace"
            ? T.workspace
            : `${T.members} (${r.memberSubs.length})`}
        </span>
        <span>
          {T.sources}: {r.sources.length}
        </span>
        <MemberName sub={r.actorSub} />
        <span>v{r.revision}</span>
        <time>{new Date(r.updatedAt).toLocaleDateString()}</time>
      </div>
      {r.sources.length ? (
        <div className="flex flex-wrap gap-sm text-body-small text-muted-foreground">
          {r.sources.map((o) => (
            <span key={`${o.kind}:${o.id}`} title={`${o.id} @ ${o.version}`}>
              {o.kind} {o.id.slice(0, 8)} / {o.version.slice(0, 8)}
            </span>
          ))}
        </div>
      ) : null}
      {r.canManage ? (
        <div className="flex flex-wrap justify-end gap-sm">
          <Button
            size="md"
            variant="ghost"
            disabled={busy}
            onClick={() => onEdit(r)}
          >
            {T.edit}
          </Button>
          <Button
            size="md"
            variant="secondary"
            disabled={busy}
            onClick={() => onToggle(r)}
          >
            {r.state === "active" ? M.stop : M.restore}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
