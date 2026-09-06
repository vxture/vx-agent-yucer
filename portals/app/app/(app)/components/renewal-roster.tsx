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

  /* GEOMETRY - and the rule that makes it hold at every width.

     PIN EVERY COLUMN EXCEPT THE TITLE. Under `table-fixed`, when the specified
     widths add up to LESS than the table, the surplus is shared out over the
     columns - all of them, proportionally, if none is left auto. Measured at
     1920px on 2026-09-06 (owner: 标题列远不止208px，肯定哪里出错了): every
     column had a width, so a 1096px container stretched 选择 and 序号 from
     56px to 100px and 操作 from 128 to 228. The DS's fixed edge columns are
     only fixed while something else can absorb the slack.

     So the title column carries NO width and takes the surplus - but only up
     to a point. A MAX-WIDTH ON THE TABLE caps how much surplus there is: at
     1096px the auto title column had swollen to 624px, which put the name far
     from the figures and left the right-hand columns huddled at the edge -
     the "middle empty, right crowded" the owner described. Past 46rem the
     table simply stops growing and the container's slack becomes margin,
     which is where empty space belongs.

     AND A FLOOR UNDER THE TITLE. Auto cuts both ways: where the pinned
     columns already fill the container the auto column gets whatever is left,
     which at one narrow width was ZERO - the name vanished entirely and the
     table scrolled. `min-w` on that column is the other half of the cap.

     Every other column is pinned at what its content measures, and the sums
     are what let the floor hold at the 616px this shell gives:
       操作 8rem   - 16 padding + 54 button + 4 gap + 32 trigger + 16 = 122px
       到期 6.5rem - 已过期 13 天 in text (the badge measured 105px and spilled)
       金额 6rem   - a 54px amount plus room for its right-hand inset
       结论 5.5rem - 低风险 / 需关注, and the not-due reason wraps below it
       待续约   64+64+104+96+128 = 456, leaving 160 for the name
       暂不到期 64+64+104+96+88+64 = 480, leaving 136
     The not-due table's action slot is the DS edge token: nothing is openable
     there, so there is no inline button to make room for - the column still
     holds its place with the dots, which is the fittings ruling. */
  const TITLE_FLOOR = "[&_thead_th:nth-child(3)]:min-w-[7.5rem]";
  const DUE_WIDTHS =
    "[&_thead_th:nth-child(4)]:w-[6.5rem] [&_thead_th:nth-child(5)]:w-[6rem] [&_thead_th:last-child]:w-[8rem]";
  const NOT_DUE_WIDTHS = `[&_thead_th:nth-child(4)]:w-[6.5rem] [&_thead_th:nth-child(5)]:w-[6rem] [&_thead_th:nth-child(6)]:w-[5.5rem] ${ACTION_COLUMN}`;

  const table = (list: readonly RenewalRow[], empty: ReactNode, due: boolean) => {
    const select = rowClickSelection(list, (r) => r.projectId, selected, setSelected);
    return (
      <div
        ref={select.ref}
        className={`[&_table]:table-fixed [&_table]:max-w-[46rem] ${EDGE_COLUMNS} ${TITLE_FLOOR} ${
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
          columns={due ? columns : [...columns, verdictColumn]}
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
