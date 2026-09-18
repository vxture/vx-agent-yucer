"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@vxture/design-ui";
import type { ChainCoverage, ContactNode, DecisionRole } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";

// 决策链图谱弹窗 (owner, 2026-09-18: 客户详情页重排).
//
// SAME DATA AS THE LIST ABOVE IT, drawn instead of enumerated - no second
// read. `coverage.missing` is what makes the missing nodes honest: they are
// roles the rule engine already decided this deal needs and could not find,
// not a guessed "someone must be missing" placeholder.
//
// FIXED TEMPLATE, NOT A FORCE LAYOUT. Five roles is a small, known set, so a
// hand-placed grid reads clearer than a graph library's physics for something
// this size - and it is coordinates in a viewBox, not path data.

const ROLE_ORDER: readonly DecisionRole[] = ["economic", "technical", "user", "coach", "blocker"];

interface RoleNode {
  readonly role: DecisionRole;
  readonly label: string;
  readonly contactName: string | null;
  readonly title: string | null;
  readonly missing: boolean;
  readonly isBlocker: boolean;
  readonly unreachable: boolean;
}

export function DecisionChainGraph({
  dealName,
  coverage,
  people,
  contacts,
}: {
  readonly dealName: string;
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
      isBlocker: role === "blocker",
      unreachable: role === "economic" && coverage.economicBuyerUnreachable,
    };
  }).filter((n): n is RoleNode => n !== null);

  // Layout: economic buyer top-centre (the anchor everything else reports
  // toward), the rest in one row beneath it.
  const top = nodes.find((n) => n.role === "economic");
  const rest = nodes.filter((n) => n.role !== "economic");
  const restX = rest.map((_, i) => 120 + i * ((600 - 240) / Math.max(rest.length - 1, 1)));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          {ACCOUNT_TEXT.graphOpen}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-(--vx-container-2xl)">
        <DialogHeader>
          <DialogTitle>{ACCOUNT_TEXT.graphTitle}</DialogTitle>
          <DialogDescription>{ACCOUNT_TEXT.graphWhy(dealName)}</DialogDescription>
        </DialogHeader>
        <svg viewBox="0 0 720 260" width="100%" role="img" aria-label={ACCOUNT_TEXT.graphTitle}>
          {top ? (
            rest.map((n, i) => (
              <line
                key={n.role}
                x1={360}
                y1={62}
                x2={restX[i]}
                y2={150}
                stroke={n.missing ? "var(--border)" : "var(--muted-foreground)"}
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
      </DialogContent>
    </Dialog>
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
    : node.isBlocker
      ? "var(--destructive)"
      : node.unreachable
        ? "var(--destructive)"
        : "var(--primary)";
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
