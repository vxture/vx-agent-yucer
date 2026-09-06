"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import { ACTION_COLUMN, EDGE_COLUMNS, MoneyCell, RowActions, rowClickSelection } from "./table-fittings";

// 续约清单 - the catalogue module's pattern, applied to renewals.
//
// TWO SECTIONS, and the split is the page's argument. What is DUE is this
// quarter's work; what is NOT is kept because one of its reasons is a defect:
// `no_end_date` on a subscription means the term will never come round on any
// screen. The old single table carried both with a verdict column, which put
// a data gap and a healthy renewal on the same line of sight.
//
// A PROPOSAL, NEVER A WRITE. Opening a renewal is a commercial approach to a
// customer - ADR-003 at its sharpest - so it is a row operation a person takes
// one customer at a time. There is deliberately no bulk equivalent: a "renew
// everything" control would approach a dozen customers on one click.
//
// THE RISK COLUMN READS THE DERIVED HEALTH, not the one the delivery team
// reported. A green report next to an overdue instalment is precisely the case
// where the reported answer is the wrong one to act on.

export interface RenewalRow {
  readonly projectId: string;
  readonly projectNo: string;
  readonly projectName: string;
  /** Negative once the term has lapsed, which is when it matters most. */
  readonly daysToEnd: number | null;
  readonly amount: number | null;
  readonly currency: string;
  readonly risk: "low" | "watch" | null;
  /** Why it is not due, when it is not. */
  readonly notDueReason: string | null;
}

export interface RenewalRosterProps {
  readonly rows: readonly RenewalRow[];
  readonly canOpen: boolean;
  readonly onOpen: (input: {
    projectId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function RenewalRoster({ rows, canOpen, onOpen }: RenewalRosterProps) {
  const { DATA_TABLE_LABELS, RENEWAL_TEXT, RENEWAL_ERROR } = useMessages();
  const [pending, startTransition] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). One state
  // across both tables: the keys are project ids.
  const [selected, setSelected] = useState<readonly string[]>([]);
  const { toast } = useToast();

  const due = rows.filter((r) => r.notDueReason === null);
  const notDue = rows.filter((r) => r.notDueReason !== null);

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({
          tone: "danger",
          title: RENEWAL_ERROR[r.error ?? "denied"] ?? RENEWAL_ERROR.denied,
        });
      });
    });

  const columns = [
    {
      id: "project",
      header: RENEWAL_TEXT.colProject,
      cell: (r: RenewalRow) => (
        <span className="flex min-w-0 flex-col">
          {/* 主标题字号加大加粗，副编号保持小字 (owner, 2026-09-06). */}
          <span className="text-foreground truncate text-body-lg font-semibold">
            {r.projectName}
          </span>
          <span className="text-muted-foreground mono truncate text-body-sm">{r.projectNo}</span>
        </span>
      ),
    },
    {
      id: "ends",
      header: RENEWAL_TEXT.colEnds,
      width: "sm" as const,
      align: "center" as const,
      cell: (r: RenewalRow) =>
        r.daysToEnd === null ? (
          <span className="text-muted-foreground text-body-sm">{RENEWAL_TEXT.noEndDate}</span>
        ) : r.daysToEnd < 0 ? (
          // A LAPSED TERM IS NOT "-12 days left". Saying it the other way round
          // is what makes it read as the most urgent row rather than the
          // furthest-away one.
          //
          // COLOUR, NOT A BADGE. The badge measured 105px against a 64px
          // content box and spilled into the amount beside it; what carries
          // the urgency is the wording and the red, not the chrome around
          // them, so the chrome is what goes (measured 2026-09-06).
          <span className="text-(color:--danger-text) text-body-sm font-semibold tabular-nums">
            {RENEWAL_TEXT.lapsed(-r.daysToEnd)}
          </span>
        ) : (
          <span className="text-foreground text-body-sm tabular-nums">
            {RENEWAL_TEXT.dueIn(r.daysToEnd)}
          </span>
        ),
    },
    {
      id: "amount",
      header: RENEWAL_TEXT.colAmount,
      width: "sm" as const,
      // 资金列：右对齐 + 右侧留白 (owner, 2026-09-06). 7rem column leaves an
      // 80px content box; the amounts measure 57px, so half the 23px of slack
      // puts the widest of them where a centred block would sit.
      align: "right" as const,
      // WHAT LAST TERM WAS WORTH, carried forward unchanged. What the next one
      // is worth is a negotiation, and seeding it with an invented uplift puts
      // a number nobody chose in front of a customer.
      cell: (r: RenewalRow) => (
        <MoneyCell pad="0.7rem">
          <span className="text-foreground text-body-sm">{formatMoney(r.amount, r.currency)}</span>
        </MoneyCell>
      ),
    },
  ];

  /* 商机分析 - the DUE table's column (owner, 2026-09-06), between the money
     and the action columns.

     WHAT IT CARRIES IS THE READ THE RULE ALREADY MAKES: `assessRenewal`
     grades a due renewal 低风险 or 需关注 from the project's DERIVED delivery
     health, not from what the delivery team reported - a green report next to
     an overdue instalment is precisely the case where the reported answer is
     the wrong one to act on. So this column says whether the renewal in front
     of you is a straightforward one, and 需关注 means look at the delivery
     before the approach.

     It is not a second dock. The dock says the same thing in a sentence with
     its evidence and offers the act; this is the one-glance version, in the
     row it belongs to. */
  const analysisColumn = {
    id: "analysis",
    header: RENEWAL_TEXT.colAnalysis,
    align: "center" as const,
    // COLOUR, NOT A BADGE - the same call the lapsed cell makes. 交付有隐忧
    // inside badge chrome measures about 94px against the 56px content box
    // this table can spare; the wording and the colour are what carry the
    // reading, so the chrome is what goes.
    cell: (r: RenewalRow) => (
      <span
        className={`text-body-sm ${
          r.risk === "watch" ? "text-(color:--warning-text) font-semibold" : "text-muted-foreground"
        }`}
      >
        {RENEWAL_TEXT.risk[r.risk ?? "low"] ?? ""}
      </span>
    ),
  };

  /* 结论 IS THE NOT-DUE TABLE'S COLUMN, and only its own. Measured against the
     616px this shell actually gives the main column: seven columns at the
     width their contents need come to about 50px more than there is, which is
     what produced both the crowding and the horizontal scrollbar (owner,
     2026-09-06). In 待续约 this column only ever held a risk badge, and the
     dock now states that same risk in a sentence with its evidence; in 暂不
     到期 it carries the REASON, which exists nowhere else on the page. So the
     column follows the information rather than the layout. */
  const verdictColumn = {
    id: "verdict",
    header: RENEWAL_TEXT.colVerdict,
    align: "center" as const,
    cell: (r: RenewalRow) =>
      r.notDueReason ? (
        <span className="text-muted-foreground text-body-sm">
          {RENEWAL_TEXT.notDue[r.notDueReason] ?? r.notDueReason}
        </span>
      ) : (
        <StatusBadge tone={r.risk === "watch" ? "warning" : "success"}>
          {RENEWAL_TEXT.risk[r.risk ?? "low"] ?? ""}
        </StatusBadge>
      ),
  };

  /* THE KEY ACTION IS OUT IN THE OPEN, the rest is behind the dots - owner
     ruling, 2026-09-06. 开商机 is the one thing anybody comes to this page to
     do; making it a menu item behind an icon costs two clicks for the page's
     entire purpose. The dots stay beside it and hold the FULL set, so nothing
     is only reachable through the shortcut.

     THE MENU KEEPS 开商机 TOO, disabled with its reason rather than hidden.
     `notDue` already spells out why a row cannot be opened - too far out,
     already renewed, no end date - and a control that vanishes teaches
     nothing, which is the same call the price book's delete item makes. */
  const rowActions = (row: RenewalRow) => {
    const openable = canOpen && row.notDueReason === null;
    return (
      <span className="flex items-center justify-end gap-2xs">
        {openable ? (
          <Button
            size="xs"
            variant="secondary"
            disabled={pending}
            onClick={() => run(onOpen({ projectId: row.projectId }))}
          >
            {RENEWAL_TEXT.open}
          </Button>
        ) : null}
        <RowActions
          disabled={pending}
          items={[
            {
              id: "open",
              label: RENEWAL_TEXT.open,
              disabled: !openable,
              hint: !canOpen
                ? RENEWAL_TEXT.denied
                : row.notDueReason
                  ? RENEWAL_TEXT.notDue[row.notDueReason]
                  : undefined,
              onSelect: () => run(onOpen({ projectId: row.projectId })),
            },
            {
              id: "delivery",
              label: RENEWAL_TEXT.viewDelivery,
              separatorBefore: true,
              onSelect: () => {
                window.location.href = "/delivery";
              },
            },
          ]}
        />
      </span>
    );
  };

  /* GEOMETRY - the table FILLS the content area, and three columns do not
     move (owner, 2026-09-06: 在表格铺满的前提下，选择列、序号列、操作列定宽).

     THE EDGES ARE PINNED AND THE TEXT COLUMN IS AUTO, and both halves are
     needed. Under `table-fixed`, a specified width only holds while some
     column is left auto to absorb the slack: with every column pinned the
     surplus is shared out proportionally, and at 1920px a 1096px container
     stretched 选择 and 序号 from 56px to 100px and 操作 to 228px. The DS's
     "fixed" edge columns are only fixed when something else can give.

     NO min-width AND NO max-width. Both were tried and both broke the fill: a
     min-width put a scrollbar under a table with room, and a max-width left
     the right of the content area empty.

     AND THE CONTENT COLUMNS ARE PERCENTAGES, NOT rem. One auto column and the
     rest pinned does fill the width, but it fills it by giving the WHOLE
     surplus to that one column: the name swelled while the figures beside it
     stayed at their rem and read as narrow, crowded and wrapping (owner,
     2026-09-06). Percentages share the surplus in a fixed ratio instead, so
     the proportions hold at 616px and at 1096px alike, and the only columns
     that never move are the three that are supposed not to.

     THE DUE TABLE IS OVER-SUBSCRIBED and its widths say so. Adding 商机分析
     took it to seven columns, and what the contents need adds up past what
     this shell gives: 项目 140 + 到期 96 + 金额 88 + 分析 88 + 操作 128 +
     edges 128 = 668 against 616. So the three right-hand columns are pinned
     at the smallest width that keeps them legible - a squeezed badge or a
     wrapped 还有 37 天 is worse than a truncated name - and the title column
     takes what is left, which is about 88px and truncates. Getting the name
     back means one of two things, and both are the owner's call: 开商机 goes
     back into the menu and the action column returns to 64px (that alone
     covers the 52px gap), or the table carries one column fewer.
     The not-due table's action slot is the 64px default: nothing is openable
     there, so there is no inline button to make room for - the column still
     holds its place with the dots, which is the fittings ruling. */
  const DUE_WIDTHS =
    "[&_thead_th:nth-child(4)]:w-[6rem] [&_thead_th:nth-child(5)]:w-[5.5rem] [&_thead_th:nth-child(6)]:w-[5.5rem] [&_thead_th:last-child]:w-[8rem]";
  const NOT_DUE_WIDTHS = `[&_thead_th:nth-child(3)]:w-[24%] ${ACTION_COLUMN}`;

  const table = (list: readonly RenewalRow[], empty: ReactNode, due: boolean) => {
    const select = rowClickSelection(list, (r) => r.projectId, selected, setSelected);
    return (
      <div
        ref={select.ref}
        className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${
          due ? DUE_WIDTHS : NOT_DUE_WIDTHS
        } ${select.className}`}
      >
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowKey={(r: RenewalRow) => r.projectId}
          rows={[...list]}
          columns={due ? [...columns, analysisColumn] : [...columns, verdictColumn]}
          rowActions={rowActions}
          empty={empty}
        />
      </div>
    );
  };

  return (
    <>
      <Section
        id="renewal"
        icon={moduleIcon("renewal")}
        title={RENEWAL_TEXT.rosterDue}
        description={RENEWAL_TEXT.rosterDueWhy}
      >
        {table(
          due,
          <EmptyState title={RENEWAL_TEXT.none} description={RENEWAL_TEXT.noneWhy} />,
          true,
        )}
        {!canOpen ? (
          <p className="text-muted-foreground mt-sm text-body-sm">{RENEWAL_TEXT.denied}</p>
        ) : null}
      </Section>

      {notDue.length > 0 ? (
        <Section
          id="renewal-not-due"
          icon="file-text"
          title={RENEWAL_TEXT.rosterNotDue}
          description={RENEWAL_TEXT.rosterNotDueWhy}
        >
          {table(
            notDue,
            <EmptyState title={RENEWAL_TEXT.none} description={RENEWAL_TEXT.noneWhy} />,
            false,
          )}
        </Section>
      ) : null}
    </>
  );
}
