"use client";

import { useState } from "react";
import { ActionMenu } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { DesignateAccount, type DesignateAccountProps } from "./designate-account";
import { AccountBasicsForm, type AccountBasicsFormProps } from "./account-basics-form";

// 每个配置动作共用一个 "···" 菜单 (owner, 2026-09-20: 死死记住设计文件 -
// mockup 原话: "···'s menu - every configuration action in one place (owner:
// 三个点操作可以来修改定级、编辑等等操作), rather than each one being its
// own header button" - 紧跟着还有一句针对定级徽标本身的: "not a button -
// modifying it moved to the ··· menu"). 这页之前把 DesignateAccount 的
// Drawer 触发器做成了它自己的常驻按钮 ("定级 · 普通级"), 跟同一行里已经
// 显示同一件事的 medal 徽标(DimensionStat)重复 - mockup 只要后者, 前者的
// 触发器搬进这个共享菜单。
//
// DesignateAccount 和 AccountBasicsForm 的表单内容完全没变, 只是把
// open/onOpenChange 从组件自己的 useState 提到这里, 两个 Drawer 互斥
// (同一时间最多开一个), 由这一个菜单决定开哪个。
export interface AccountHeaderMenuProps {
  readonly canWrite: boolean;
  readonly tier: Omit<DesignateAccountProps, "open" | "onOpenChange">;
  readonly basics: Omit<AccountBasicsFormProps, "open" | "onOpenChange">;
}

export function AccountHeaderMenu({ canWrite, tier, basics }: AccountHeaderMenuProps) {
  const { DS_LABELS, POSITION_TEXT, ACCOUNT_BASICS_TEXT } = useMessages();
  const [active, setActive] = useState<"tier" | "basics" | null>(null);

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
    </>
  );
}
