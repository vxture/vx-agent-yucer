"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, Field, FieldLabel, Icon, Input, Section, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 关联协作人 (incr/0074, owner 2026-09-20: mockup - "内部同事可以有多个协作
// 人，但主负责人始终只有一个，这里关联的都是协作人，不是替换主负责人").
//
// 主负责人 (account.ownerSub) 不在这张卡上 - 显示它需要把 sub 解析成人名,
// 这条链路本身还没有接 (owner: 负责人和 stage 翻译先跳过). 这张卡只管它自己
// 新增的那部分事实: 谁是协作人。

export interface CollaboratorRow {
  readonly memberSub: string;
  readonly displayName: string | null;
}

export interface ColleagueSearchHit {
  readonly sub: string;
  readonly displayName: string | null;
}

export interface CollaboratorPanelProps {
  readonly accountId: string;
  readonly collaborators: readonly CollaboratorRow[];
  readonly canManage: boolean;
  readonly onSearch: (query: string) => Promise<{ ok: boolean; error?: string; results?: ColleagueSearchHit[] }>;
  readonly onAdd: (accountId: string, memberSub: string) => Promise<{ ok: boolean; error?: string }>;
  readonly onRemove: (accountId: string, memberSub: string) => Promise<{ ok: boolean; error?: string }>;
}

export function CollaboratorPanel({
  accountId,
  collaborators,
  canManage,
  onSearch,
  onAdd,
  onRemove,
}: CollaboratorPanelProps) {
  const { COLLABORATOR_TEXT, ACCOUNT_ERROR } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly ColleagueSearchHit[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!canManage && collaborators.length === 0) return null;

  const openDrawer = () => {
    setQuery("");
    setResults([]);
    setPicked(null);
    setOpen(true);
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        const r = await onSearch(query);
        setResults(r.ok ? (r.results ?? []) : []);
      });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const submit = () => {
    if (!picked) return;
    startSave(async () => {
      const r = await onAdd(accountId, picked);
      if (!r.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? r.error ?? "" });
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const remove = (memberSub: string) => {
    startSave(async () => {
      const r = await onRemove(accountId, memberSub);
      if (!r.ok) toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? r.error ?? "" });
      else router.refresh();
    });
  };

  return (
    <>
      <Section
        tone="raised"
        icon="users"
        title={COLLABORATOR_TEXT.title}
        action={
          canManage ? (
            <Button variant="ghost" size="sm" onClick={openDrawer}>
              {COLLABORATOR_TEXT.linkButton}
            </Button>
          ) : undefined
        }
      >
        {collaborators.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{COLLABORATOR_TEXT.none}</p>
        ) : (
          <div className="flex flex-col gap-sm">
            {collaborators.map((c) => (
              <div key={c.memberSub} className="gap-sm border-border flex items-center border-b py-sm last:border-b-0">
                <span className="bg-accent text-muted-foreground flex h-lg w-lg flex-none items-center justify-center rounded-full text-label-sm font-bold">
                  {(c.displayName ?? c.memberSub).charAt(0)}
                </span>
                <span className="text-body-sm min-w-0 flex-1 truncate font-bold">{c.displayName ?? c.memberSub}</span>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={saving}
                    aria-label={COLLABORATOR_TEXT.remove}
                    title={COLLABORATOR_TEXT.remove}
                    onClick={() => remove(c.memberSub)}
                  >
                    <Icon name="x" size="sm" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="sm"
        title={COLLABORATOR_TEXT.drawerTitle}
        description={COLLABORATOR_TEXT.why}
        closeLabel={COLLABORATOR_TEXT.cancel}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>
              {COLLABORATOR_TEXT.cancel}
            </Button>
            <Button disabled={!picked || saving} onClick={submit}>
              {COLLABORATOR_TEXT.confirm}
            </Button>
          </div>
        }
      >
        <div className="gap-lg flex flex-col">
          <Field>
            <FieldLabel>{COLLABORATOR_TEXT.searchLabel}</FieldLabel>
            <Input
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder={COLLABORATOR_TEXT.searchPlaceholder}
            />
          </Field>
          <div className="flex flex-col gap-sm">
            {query.trim().length < 2 ? (
              <p className="text-muted-foreground text-body-sm">{COLLABORATOR_TEXT.hint}</p>
            ) : searching ? null : results.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{COLLABORATOR_TEXT.empty}</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.sub}
                  type="button"
                  onClick={() => setPicked(r.sub)}
                  className={`gap-sm border-border flex items-center rounded-md border-2 p-sm text-left ${
                    picked === r.sub ? "border-primary bg-primary-muted" : "bg-card"
                  }`}
                >
                  <span className="bg-accent text-muted-foreground flex h-lg w-lg flex-none items-center justify-center rounded-full text-label-sm font-bold">
                    {(r.displayName ?? r.sub).charAt(0)}
                  </span>
                  <span className="text-body-sm font-bold">{r.displayName ?? r.sub}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </Drawer>
    </>
  );
}
