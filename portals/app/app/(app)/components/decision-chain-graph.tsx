"use client";

import type { ChainCoverage, ContactNode, DecisionRole } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";

// 决策链图谱 (owner, 2026-09-18: 客户详情页重排; 2026-09-20: 设计图严格
// 对齐 - mockup 原话"决策链两个板块都内嵌在栏2里", 不是弹窗). 曾经是一个
// Dialog 触发的弹窗; 现在 decision-chain-detail.tsx 用一个表格/图谱的
// segmented 切换控制它的可见性, 图谱本身就是内嵌面板的一半, 不再需要自己
// 的触发按钮和弹窗外壳。这个组件目前只有 account-detail 一个调用方
// (跟 decision-chain.tsx 不同 - 那个还被 pipeline 详情页共用), 所以直接
// 改掉整个导出形状是安全的。
//
// SAME DATA AS THE LIST ABOVE IT, drawn instead of enumerated - no second
// read. `coverage.missing` is what makes the missing nodes honest: they are
// roles the rule engine already decided this deal needs and could not find,
// not a guessed "someone must be missing" placeholder.
//
// FIXED TEMPLATE, NOT A FORCE LAYOUT. Five roles is a small, known set, so a
// hand-placed grid reads clearer than a graph library's physics for something
// this size - and it is coordinates in a viewBox, not path data.

// Exported: decision-chain-detail.tsx's table view walks the same five roles
// in the same order, so the table and the graph never disagree about which
// roles exist or what order they read in.
export const ROLE_ORDER: readonly DecisionRole[] = ["economic", "technical", "user", "coach", "blocker"];

// 五个角色各一个颜色 (owner, 2026-09-21: 有四个角色，视图中合并成了三个，
// 应该拆开) - 之前 technical 和 coach 共用同一个 muted-foreground 灰点,
// 图上两个本来不同的角色看不出区别。这五个 token 跟 dimension-stat.tsx 的
// TONE_SURFACE 是同一套(brand/info/warning/success/danger), 不是另起一套
// 颜色 - 只是那边给的是 Tailwind 类名, 这里节点画在 SVG 里要用 CSS 变量。
const ROLE_COLOR: Record<DecisionRole, string> = {
  economic: "var(--primary)",
  technical: "var(--info)",
  user: "var(--warning)",
  coach: "var(--success)",
  blocker: "var(--destructive)",
  // ROLE_ORDER 排除 "unknown" (只有五个真实角色进图), 这个节点永远不会真的
  // 用到这个值 - 只是 DecisionRole 类型本身带着它, Record 需要穷尽。
  unknown: "var(--muted-foreground)",
};

interface RoleNode {
  readonly role: DecisionRole;
  readonly label: string;
  readonly contactName: string | null;
  readonly title: string | null;
  readonly missing: boolean;
  readonly unreachable: boolean;
}

export function DecisionChainGraph({
  coverage,
  people,
  contacts,
}: {
  readonly coverage: ChainCoverage;
  readonly people: readonly ContactNode[];
  readonly contacts: readonly { id: string; name: string; title: string | null }[];
}) {
  const { ACCOUNT_TEXT, DECISION_ROLE_LABEL } = useMessages();
  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? id;
  const titleOf = (id: string) => contacts.find((c) => c.id === id)?.title ?? null;

  const nodes: RoleNode[] = ROLE_ORDER.map((role) => {
    const person = people.find((p) => p.decisionRole === role);
    const isMissing = !person && coverage.missing.includes(role);
    // A role neither covered nor in `missing` (user is never required, and
    // blocker is never "missing" by definition) simply has no node - drawing
    // an empty slot for a role the rule never asked about would invent a gap
    // that is not real.
    if (!person && !isMissing) return null;
    return {
      role,
      label: DECISION_ROLE_LABEL[role] ?? role,
      contactName: person ? nameOf(person.id) : null,
      title: person ? titleOf(person.id) : null,
      missing: isMissing,
      unreachable: role === "economic" && coverage.economicBuyerUnreachable,
    };
  }).filter((n): n is RoleNode => n !== null);

  // Layout: economic buyer top-centre (the anchor everything else reports
  // toward), the rest in one row beneath it.
  const top = nodes.find((n) => n.role === "economic");
  const rest = nodes.filter((n) => n.role !== "economic");
  const restX = rest.map((_, i) => 120 + i * ((600 - 240) / Math.max(rest.length - 1, 1)));

  return (
    <div className="w-full">
      {/* 图例 (owner, 2026-09-20: 设计图严格对齐 - mockup 的图谱面板自带一行
          图例, 不是靠颜色自己说明). 只列这条链实际出现的角色 (owner,
          2026-09-21: 有四个角色，视图中合并成了三个，应该拆开) - 不是固定
          写死 3 条, 每个真实出现的角色一个颜色、一条图例, 跟节点一一对应。 */}
      <div className="gap-md text-muted-foreground mb-sm flex flex-wrap text-body-sm">
        {nodes.map((n) => (
          <span key={n.role} className="gap-2xs inline-flex items-center">
            <span
              className="inline-block h-[0.4375rem] w-[0.4375rem] rounded-full"
              style={{ backgroundColor: n.missing ? "var(--border)" : ROLE_COLOR[n.role] }}
            />
            {n.label}
          </span>
        ))}
      </div>
      {/* w-full (owner, 2026-09-21: 补充调查 - 图谱渲染只有 166px 宽, 文字
          糊成一团) - 这个组件自己没有类名的根 div 在栏2 的 flex-col 容器里
          没有拿到预期的"撑满一行", SVG 的 width="100%" 又是相对父元素的
          百分比, 父元素本身宽度不确定时浏览器会退回内在尺寸(远小于实际可用
          宽度)。显式给 w-full 让父元素有一个确定宽度, width="100%" 才有
          东西可以百分比。 */}
      <svg viewBox="0 0 720 260" width="100%" role="img" aria-label={ACCOUNT_TEXT.graphTitle}>
        {top ? (
          rest.map((n, i) => (
            <line
              key={n.role}
              x1={360}
              y1={62}
              x2={restX[i]}
              y2={150}
              stroke={n.missing ? "var(--border)" : ROLE_COLOR[n.role]}
              strokeWidth={2}
              strokeDasharray={n.missing ? "4 3" : undefined}
            />
          ))
        ) : null}

        {top ? <RoleCircle node={top} cx={360} cy={62} r={32} /> : null}
        {rest.map((n, i) => (
          <RoleCircle key={n.role} node={n} cx={restX[i]} cy={150} r={28} />
        ))}
      </svg>
    </div>
  );
}

function RoleCircle({
  node,
  cx,
  cy,
  r,
}: {
  readonly node: RoleNode;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}) {
  const { ACCOUNT_TEXT } = useMessages();
  const stroke = node.missing
    ? "var(--border)"
    : node.unreachable
      ? "var(--destructive)"
      : ROLE_COLOR[node.role];
  const fill = node.missing ? "var(--background)" : "var(--muted)";
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray={node.missing ? "4 3" : undefined}
      />
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--foreground)">
        {node.contactName ?? node.label}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9.5} fill="var(--muted-foreground)">
        {node.missing
          ? ACCOUNT_TEXT.graphMissingRole
          : node.unreachable
            ? ACCOUNT_TEXT.graphUnreachable
            : node.contactName
              ? node.label
              : (node.title ?? node.label)}
      </text>
    </g>
  );
}
