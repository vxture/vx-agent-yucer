"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, Field, FieldLabel, Icon, Input, useToast } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 销售负责人 (owner, 2026-09-20: 死死记住设计文件 - mockup 原话:
// "销售负责人 - 移到联系人上面...单列出来, 不跟客户自己的属性混在一起 -
// 行业/区域/状态是客户本身的事实, 谁负责跟进是我们内部的分工, 两件事不该
// 挤在同一张表格里". ACCOUNT_BASICS_TEXT.why 已经写着"谁负责跟进...这些
// 另有自己的卡片" - 这就是那张"自己的卡片"的编辑入口, 不折进
// account-basics-form.tsx 的"编辑单位信息"抽屉。
//
// CONTROLLED, NOT SELF-TRIGGERING (owner, 2026-09-20: 补充 - 客户总编辑,
// 三个分散的编辑入口(定级/计划、编辑单位信息、编辑销售负责人)合并成一个,
// 侧栏顶部功能条的一个按钮). 这个组件曾经自己长一个 header 里的小铅笔图标
// 触发器 (跟 designate-account.tsx"每个配置项自己的按钮"是同一个道理) -
// 现在跟 designate-account.tsx/account-basics-form.tsx 一样改成受控组件,
// 触发器统一收进 account-header-menu.tsx 的共享菜单。展示层(header 纯文本
// "销售负责人 王涛")完全没变, 只是编辑入口从这里搬走了。
//
// TWO LEVELS, 跟 mockup 的"销售负责人"卡 + 它自己的"关联协作人"抽屉一样：
// 外层抽屉是名单(主负责人 + 协作人，每位协作人可移除)，"+ 关联"再开一层
// 内层抽屉去搜索/确认 - 内层抽屉仍然是这个组件自己管理的本地状态, 只有
// 外层抽屉的 open 状态提升给了调用方。
//
// 主负责人(account.ownerSub) 本身在这次改动里不可改 - reassignAccount 这个
// 服务动词虽然存在, 但没有人要求过"从这张卡改主负责人"这个交互, 加一个没人
// 用过的写路径不是这次的范围。这里能做的只是管理协作人名单。

export interface OwnerRow {
  readonly memberSub: string;
  readonly displayName: string | null;
}

export interface ColleagueSearchHit {
  readonly sub: string;
  readonly displayName: string | null;
}

export interface OwnerEditorProps {
  readonly accountId: string;
  readonly ownerName: string | null;
  readonly collaborators: readonly OwnerRow[];
  readonly canManage: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSearch: (query: string) => Promise<{ ok: boolean; error?: string; results?: ColleagueSearchHit[] }>;
  readonly onAdd: (accountId: string, memberSub: string) => Promise<{ ok: boolean; error?: string }>;
  readonly onRemove: (accountId: string, memberSub: string) => Promise<{ ok: boolean; error?: string }>;
}

export function OwnerEditor({
  accountId,
  ownerName,
  collaborators,
  canManage,
  open,
  onOpenChange,
  onSearch,
  onAdd,
  onRemove,
}: OwnerEditorProps) {
  const { COLLABORATOR_TEXT, ACCOUNT_TEXT, ACCOUNT_ERROR } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly ColleagueSearchHit[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!canManage) return null;

  const openLinkDrawer = () => {
    setQuery("");
    setResults([]);
    setPicked(null);
    setLinkOpen(true);
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
      setLinkOpen(false);
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
      <Drawer
        open={open}
        onClose={() => onOpenChange(false)}
        width="sm"
        title={COLLABORATOR_TEXT.title}
        footer={
          <Button variant="ghost" size="sm" onClick={openLinkDrawer}>
            {COLLABORATOR_TEXT.linkButton}
          </Button>
        }
      >
        <div className="flex flex-col gap-sm">
          <div className="gap-sm border-border flex items-center border-b py-sm">
            <span className="bg-accent text-muted-foreground flex h-lg w-lg flex-none items-center justify-center rounded-full text-label-sm font-bold">
              {(ownerName ?? ACCOUNT_TEXT.ownerNone).charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-body-sm truncate font-bold">{ownerName ?? ACCOUNT_TEXT.ownerNone}</div>
              <div className="text-muted-foreground text-body-sm">{COLLABORATOR_TEXT.primary}</div>
            </div>
          </div>
          {collaborators.length === 0 ? (
            <p className="text-muted-foreground text-body-sm">{COLLABORATOR_TEXT.none}</p>
          ) : (
            collaborators.map((c) => (
              <div key={c.memberSub} className="gap-sm border-border flex items-center border-b py-sm last:border-b-0">
                <span className="bg-accent text-muted-foreground flex h-lg w-lg flex-none items-center justify-center rounded-full text-label-sm font-bold">
                  {(c.displayName ?? c.memberSub).charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm truncate font-bold">{c.displayName ?? c.memberSub}</div>
                  <div className="text-muted-foreground text-body-sm">{COLLABORATOR_TEXT.tag}</div>
                </div>
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
              </div>
            ))
          )}
        </div>
      </Drawer>

      <Drawer
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        width="sm"
        title={COLLABORATOR_TEXT.drawerTitle}
        description={COLLABORATOR_TEXT.why}
        closeLabel={COLLABORATOR_TEXT.cancel}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" disabled={saving} onClick={() => setLinkOpen(false)}>
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
