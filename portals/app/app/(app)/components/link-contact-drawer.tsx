"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, Field, FieldLabel, Input, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 关联联系人 (owner, 2026-09-20: mockup - "把系统里已有的人接到这个客户名下，
// 不会新建一条联系人记录"). "+新增"(建一个全新的人) 和 "关联"(把系统里已有的
// 人接到这个客户名下) 是两件不同的事 - 之前只有"+新增"一个入口，等于把
// "关联"这条路堵死了。这是那第二条路的表单：搜索 -> 挑一个 -> 确认。
//
// 搜索框每次变化都新起一次 debounce 过的服务端调用, 不是前端过滤 - 候选人
// 来自整个工作区（不止这一个客户已经关联的那几位）, 前端拿不到这份名单。

export interface ContactSearchHit {
  readonly id: string;
  readonly name: string;
  readonly mobile: string | null;
  readonly email: string | null;
  readonly affiliations: ReadonlyArray<{ accountId: string; accountName: string; title: string | null }>;
}

export interface LinkContactDrawerProps {
  readonly accountId: string;
  readonly onSearch: (accountId: string, query: string) => Promise<{ ok: boolean; error?: string; results?: ContactSearchHit[] }>;
  readonly onLink: (accountId: string, personId: string) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Opened from outside (the contacts panel's "⋮" 关联, owner 2026-09-23):
   * a bumped number opens it, and the drawer's own trigger button is not
   * drawn. Absent: the drawer brings its own button, as before.
   */
  readonly openSignal?: number;
}

export function LinkContactDrawer({ accountId, onSearch, onLink, openSignal }: LinkContactDrawerProps) {
  const { LINK_CONTACT_TEXT, ACCOUNT_ERROR } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly ContactSearchHit[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [linking, startLink] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDrawer = () => {
    setQuery("");
    setResults([]);
    setPicked(null);
    setOpen(true);
  };

  useEffect(() => {
    if (openSignal) openDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        const r = await onSearch(accountId, query);
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
    startLink(async () => {
      const r = await onLink(accountId, picked);
      if (!r.ok) {
        toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? r.error ?? "" });
        return;
      }
      toast({ tone: "success", title: LINK_CONTACT_TEXT.linked });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      {openSignal === undefined ? (
        <Button variant="ghost" size="sm" onClick={openDrawer}>
          {LINK_CONTACT_TEXT.linkButton}
        </Button>
      ) : null}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="sm"
        title={LINK_CONTACT_TEXT.title}
        description={LINK_CONTACT_TEXT.why}
        closeLabel={LINK_CONTACT_TEXT.cancel}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" disabled={linking} onClick={() => setOpen(false)}>
              {LINK_CONTACT_TEXT.cancel}
            </Button>
            <Button disabled={!picked || linking} onClick={submit}>
              {LINK_CONTACT_TEXT.confirm}
            </Button>
          </div>
        }
      >
        <div className="gap-lg flex flex-col">
          <Field>
            <FieldLabel>{LINK_CONTACT_TEXT.searchLabel}</FieldLabel>
            <Input
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              placeholder={LINK_CONTACT_TEXT.searchPlaceholder}
            />
          </Field>
          <div className="flex flex-col gap-sm">
            {query.trim().length < 2 ? (
              <p className="text-muted-foreground text-body-sm">{LINK_CONTACT_TEXT.hint}</p>
            ) : searching ? null : results.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{LINK_CONTACT_TEXT.empty}</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setPicked(r.id)}
                  className={`gap-sm border-border flex items-center rounded-md border-2 p-sm text-left ${
                    picked === r.id ? "border-primary bg-primary-muted" : "bg-card"
                  }`}
                >
                  <span className="bg-accent text-muted-foreground flex h-lg w-lg flex-none items-center justify-center rounded-full text-label-sm font-bold">
                    {r.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-body-sm font-bold">{r.name}</div>
                    <div className="text-muted-foreground text-body-sm">
                      {r.affiliations.length > 0
                        ? LINK_CONTACT_TEXT.alsoAt(r.affiliations[0]!.accountName, r.affiliations[0]!.title)
                        : LINK_CONTACT_TEXT.unaffiliated}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </Drawer>
    </>
  );
}
