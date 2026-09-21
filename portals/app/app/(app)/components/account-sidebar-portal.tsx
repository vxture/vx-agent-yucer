"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ACCOUNT_SIDEBAR_SLOT_ID } from "../lib/sidebar-slot";

// 栏1 搬进页面边的 sidebar (owner, 2026-09-20: 死死记住这次的要求 - "整体
// 页面是三栏，不是内容区还是两栏"). page.tsx 已经在一次服务端读里拿到了栏1
// 需要的全部数据(单位信息/联系人/决策链摘要/档案缺口都是同一批读), 这里只
// 换它在 DOM 里出现的位置, 不重新发一次请求 - app-shell.tsx 在账户详情路由
// 下渲染的是同一个 <aside>(宽度、独立滚动跟 NavBoard 一样, 只是内容换了),
// 这个组件把 page.tsx 已经建好的栏1内容原样传送过去。
//
// ChainViewProvider 跨两栏共享的状态不受影响 - Portal 只改 DOM 输出位置,
// 不改 React 树本身, 栏1(ChainSummaryList)和栏2(ChainDetailSlot)仍然是同一个
// Provider 下的两个消费者。
//
// 客户端挂载后才找得到目标节点, 首帧会有一瞬间栏1是空的 - 这是 Portal 在
// SSR 场景下的已知代价(服务端没有真实 DOM, 传送不过去), 不是这里的 bug。
export function AccountSidebarPortal({ children }: { readonly children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById(ACCOUNT_SIDEBAR_SLOT_ID));
  }, []);

  if (!target) return null;
  return createPortal(children, target);
}
