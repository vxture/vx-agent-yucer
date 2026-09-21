"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 栏1 搬进页面边的 sidebar (owner, 2026-09-20: 死死记住这次的要求 - "整体
// 页面是三栏，不是内容区还是两栏"). page.tsx 已经在一次服务端读里拿到了栏1
// 需要的全部数据(单位信息/联系人/决策链摘要/档案缺口都是同一批读), 这里只
// 换它在 DOM 里出现的位置, 不重新发一次请求 - app-shell.tsx 在账户详情路由
// 下渲染的是同一个 <aside>(宽度、独立滚动跟 NavBoard 一样, 只是内容换了),
// 这个组件把 page.tsx 已经建好的内容原样传送过去。
//
// GENERIC over `slotId` (owner: 客户总编辑 - 侧栏顶部功能条需要第二个独立的
// portal 目标, 跟单位信息卡片那个不是同一个) - 两个消费者(主档案卡片、
// 编辑触发器)各自把内容传送到 app-shell.tsx 建好的对应空 div, 不是同一段
// DOM 里塞两份不相关的东西。
//
// ChainViewProvider 跨两栏共享的状态不受影响 - Portal 只改 DOM 输出位置,
// 不改 React 树本身, 栏1(ChainSummaryList)和栏2(ChainDetailSlot)仍然是同一个
// Provider 下的两个消费者。
//
// 客户端挂载后才找得到目标节点, 首帧会有一瞬间是空的 - 这是 Portal 在
// SSR 场景下的已知代价(服务端没有真实 DOM, 传送不过去), 不是这里的 bug。
//
// MutationObserver, 不是一次性的 getElementById (owner, 2026-09-20: 验证
// 收起/展开时发现的真实 bug - 收起档案栏会把整个 <aside> 换成窄边条,
// 目标 div 连同它一起卸载; 再展开时 app-shell.tsx 建一个全新的、同 id 的
// div, 但这个组件自己(page.tsx 那一侧的 React 树)从头到尾没有重新挂载,
// 只在 mount 时跑一次的 useEffect 不会再执行, target 状态停留在已经被
// 卸载的旧节点上, 于是 createPortal 传送到一个不再是文档一部分的 detached
// 节点 - 屏幕上什么都不显示。观察 document.body 的子树变化, 目标节点被
// 替换的瞬间重新查一次, 这是收起/展开这类"目标节点本身会被卸载重建"场景
// 下 portal 都要处理的问题, 不是这一个页面独有的。
export function AccountSidebarPortal({
  slotId,
  children,
}: {
  readonly slotId: string;
  readonly children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      setTarget((prev) => {
        const next = document.getElementById(slotId);
        return next === prev ? prev : next;
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [slotId]);

  if (!target) return null;
  return createPortal(children, target);
}
