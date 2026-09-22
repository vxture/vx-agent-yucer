"use client";

import { useState } from "react";
import { ActionMenu } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { DesignateAccount, type DesignateAccountProps } from "./designate-account";
import { AccountBasicsForm, type AccountBasicsFormProps } from "./account-basics-form";
import { OwnerEditor, type OwnerEditorProps } from "./owner-editor";

// 客户总编辑 (owner, 2026-09-20: 补充 - 三个分散的编辑入口合并成一个,
// 放侧栏顶部功能条). 这个组件本来是 mockup 那句"···'s menu - every
// configuration action in one place...rather than each one being its own
// header button"的落地 - 定级/计划、编辑单位信息两项共用一个菜单; 现在再
// 加编辑销售负责人, 同一个原则再往前走一步: 之前销售负责人自己长了一个
// header 里的小铅笔图标, 是散落的第三个编辑入口, 现在收进同一个菜单。
// 展示的位置也变了 - 之前挂在 ViewHeader 的 action 里, 现在挂在侧栏顶部的
// 功能条(app-shell.tsx 建的返回/收起展开旁边), 但这个组件本身的职责完全
// 没变: 一个触发器, 互斥的 N 个抽屉。
//
// DesignateAccount/AccountBasicsForm/OwnerEditor 的表单内容完全没变, 只是
// open/onOpenChange 从组件自己的 useState 提到这里, 同一时间最多开一个,
// 由这一个菜单决定开哪个。
export interface AccountHeaderMenuProps {
  readonly canWrite: boolean;
  readonly tier: Omit<DesignateAccountProps, "open" | "onOpenChange">;
  readonly basics: Omit<AccountBasicsFormProps, "open" | "onOpenChange">;
  readonly owner: Omit<OwnerEditorProps, "open" | "onOpenChange">;
}

export function AccountHeaderMenu({ canWrite, tier, basics, owner }: AccountHeaderMenuProps) {
  const { DS_LABELS, POSITION_TEXT, ACCOUNT_BASICS_TEXT, COLLABORATOR_TEXT } = useMessages();
  const [active, setActive] = useState<"tier" | "basics" | "owner" | null>(null);

  if (!canWrite) return null;

  return (
    <>
      <ActionMenu
        label={DS_LABELS.actionMenu}
        items={[
          {
            id: "tier",
            label: POSITION_TEXT.designateMenu,
            onSelect: () => setActive("tier"),
          },
          {
            id: "basics",
            label: ACCOUNT_BASICS_TEXT.editButton,
            onSelect: () => setActive("basics"),
          },
          {
            id: "owner",
            label: COLLABORATOR_TEXT.editButton,
            onSelect: () => setActive("owner"),
          },
        ]}
      />
      <DesignateAccount
        {...tier}
        open={active === "tier"}
        onOpenChange={(open) => setActive(open ? "tier" : null)}
      />
      <AccountBasicsForm
        {...basics}
        open={active === "basics"}
        onOpenChange={(open) => setActive(open ? "basics" : null)}
      />
      <OwnerEditor
        {...owner}
        open={active === "owner"}
        onOpenChange={(open) => setActive(open ? "owner" : null)}
      />
    </>
  );
}
