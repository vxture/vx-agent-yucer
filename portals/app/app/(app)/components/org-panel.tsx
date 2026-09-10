"use client";

import { Button, ButtonGroup, DataTable, Drawer, EmptyState, Icon, Section, useToast } from "@vxture/design-ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, moveItems } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import type { MoveDirection } from "../../domains/shared/ordering";
import { moveOrgUnitAction, removeOrgUnitAction } from "../admin/org/actions";
import { Tag } from "./tag";

/* 组织结构 - 展示. DISPLAY ONLY, the shape /admin/roles has.
 *
 * THE ROSTER IS THE TREE. One table, in tree order, indented by depth with a
 * chevron on every unit that has units under it - the same row shape the
 * permission tree draws, because a reader who has learned one has learned
 * the other. Folding is view state and nothing else.
 *
 * THE ORDER IS THE ORDER, per parent: sort_order is what this roster, the
 * parent select on the unit form and the unit menu on /admin/members all
 * follow, so there are no sortable headers; the four moves are in the row's
 * menu and move a unit AMONG ITS SIBLINGS.
 *
 * 单位详情 answers the question 成员管理 could not: who is in 华南分公司. It
 * is a drawer, view-only; 编辑 in its foot goes to the one form.
 */

export interface OrgUnitRow {
  readonly id: string;
  readonly unitCode: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly kindName: string | null;
  readonly leaderSub: string | null;
  readonly leaderName: string | null;
  /** Members placed HERE, not counting the units under it. */
  readonly members: number;
  readonly depth: number;
  readonly children: number;
}

export function OrgPanel({
  rows,
  editable,
  unitMembers,
}: {
  /** In tree order: a parent precedes its children. */
  readonly rows: readonly OrgUnitRow[];
  readonly editable: boolean;
  /** unit id -> the names placed there, for the drawer. */
  readonly unitMembers: Readonly<Record<string, readonly string[]>>;
}) {
  const { DATA_TABLE_LABELS, ORG_ERROR, ORG_TEXT, ROW_OPS } = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const { toast } = useToast();

  /* WHICH UNIT THE DRAWER SHOWS IS IN THE URL (`?details=<code>`), as on
     /admin/roles: it survives the refresh every move causes. */
  const details = useMemo(() => {
    const code = params.get("details");
    return code ? (rows.find((r) => r.unitCode === code) ?? null) : null;
  }, [params, rows]);
  const setDetails = (r: OrgUnitRow | null) => {
    const next = new URLSearchParams(params.toString());
    if (r) next.set("details", r.unitCode);
    else next.delete("details");
    const qs = next.toString();
    router.replace(qs ? `/admin/org?${qs}` : "/admin/org", { scroll: false });
  };

  /* A row is shown while no ancestor is folded. Parents precede children in
     `rows`, so one pass with a hidden-set suffices. */
  const visible = useMemo(() => {
    const hidden = new Set<string>();
    const out: OrgUnitRow[] = [];
    for (const r of rows) {
      if (r.parentId && (hidden.has(r.parentId) || collapsed.has(r.parentId))) {
        hidden.add(r.id);
        continue;
      }
      out.push(r);
    }
    return out;
  }, [rows, collapsed]);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const branches = useMemo(() => rows.filter((r) => r.children > 0).map((r) => r.id), [rows]);

  /* A move lands among siblings, so the position the menu greys on is the
     position among them, not the row's place in the flattened list. */
  const siblingsOf = (r: OrgUnitRow) => rows.filter((x) => x.parentId === r.parentId);
  const move = (id: string, direction: MoveDirection) =>
    start(async () => {
      const res = await moveOrgUnitAction(id, direction);
      if (!res.ok) toast({ tone: "danger", title: ORG_ERROR[res.error] ?? res.error });
      else router.refresh();
    });
  const remove = async (r: OrgUnitRow) => {
    const res = await removeOrgUnitAction(r.id);
    if (!res.ok) {
      toast({ tone: "danger", title: ORG_ERROR[res.error] ?? res.error });
      throw new Error(res.error);
    }
    if (res.unplaced > 0) toast({ tone: "info", title: ORG_TEXT.removeDone(res.unplaced) });
    if (details?.id === r.id) setDetails(null);
    router.refresh();
  };

  const children = details ? rows.filter((r) => r.parentId === details.id) : [];
  const placedHere = details ? (unitMembers[details.id] ?? []) : [];

  return (
    <Section
      id="org"
      action={
        rows.length > 0 ? (
          <ButtonGroup>
            <Button variant="secondary" size="sm" onClick={() => setCollapsed(new Set())}>{ORG_TEXT.expandAll}</Button>
            <Button variant="secondary" size="sm" onClick={() => setCollapsed(new Set(branches))}>{ORG_TEXT.collapseAll}</Button>
          </ButtonGroup>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState title={ORG_TEXT.emptyTitle} description={ORG_TEXT.emptyWhy} />
      ) : (
        <div
          className={
            `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
            + " [&_thead_th:nth-child(4)]:w-[7rem]"
            + " [&_thead_th:nth-child(5)]:w-[10rem]"
            + " [&_thead_th:nth-child(6)]:w-[6rem]"
          }
        >
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={1}
            selectedKeys={selected}
            onSelectionChange={(keys) => setSelected([...keys])}
            rowActions={(r: OrgUnitRow) => {
              const sib = siblingsOf(r);
              const at = sib.findIndex((x) => x.id === r.id);
              return (
                <RowActions
                  disabled={pending}
                  items={[
                    { id: "details", label: ROW_OPS.details(ORG_TEXT.noun), onSelect: () => setDetails(r) },
                    ...(editable
                      ? [
                          { id: "edit", label: ROW_OPS.configure(ORG_TEXT.noun), onSelect: () => router.push(`/admin/org/${r.id}`) },
                          ...moveItems(ROW_OPS, at, sib.length, (d) => move(r.id, d)),
                          /* The FK's RESTRICT, said first: a trunk is not
                             deleted while anything stands under it. */
                          {
                            id: "remove",
                            label: ROW_OPS.remove(ORG_TEXT.noun),
                            separatorBefore: true,
                            danger: true as const,
                            disabled: r.children > 0,
                            hint: r.children > 0 ? ORG_TEXT.removeChildrenHint(r.children) : undefined,
                            confirm: {
                              verb: ROW_OPS.remove(ORG_TEXT.noun),
                              target: ORG_TEXT.removeTarget(r.name),
                              consequence: ORG_TEXT.removeConsequence(r.members),
                              titleTemplate: ORG_TEXT.destructiveTitle,
                              cancelLabel: ORG_TEXT.cancel,
                              onConfirm: () => remove(r),
                            },
                          },
                        ]
                      : []),
                  ]}
                />
              );
            }}
            rowKey={(r: OrgUnitRow) => r.unitCode}
            rows={visible}
            columns={[
              {
                /* THE TREE COLUMN: indent by depth, chevron on a branch, the
                   name opens 单位详情 for every reader. */
                id: "unit",
                header: ORG_TEXT.colUnit,
                cell: (r: OrgUnitRow) => (
                  <span className="gap-xs flex items-center" style={{ paddingLeft: `${r.depth * 1.5}rem` }}>
                    {r.children > 0 ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={!collapsed.has(r.id)}
                        aria-label={r.name}
                        onClick={() => toggle(r.id)}
                      >
                        <Icon name={collapsed.has(r.id) ? "chevron-right" : "chevron-down"} size="sm" />
                      </Button>
                    ) : (
                      <span className="w-8 shrink-0" />
                    )}
                    <button
                      type="button"
                      className="gap-3xs flex min-w-0 cursor-pointer flex-col text-left"
                      aria-label={ORG_TEXT.detailsTitle(r.name)}
                      onClick={() => setDetails(r)}
                    >
                      <span className="gap-xs flex items-center">
                        <span className="text-body truncate font-medium">{r.name}</span>
                        {r.children > 0 ? <Tag>{ORG_TEXT.childCount(r.children)}</Tag> : null}
                      </span>
                      <span className="text-muted-foreground text-body-sm truncate">{r.unitCode}</span>
                    </button>
                  </span>
                ),
              },
              {
                id: "kind",
                header: ORG_TEXT.colKind,
                cell: (r: OrgUnitRow) =>
                  r.kindName ? <Tag>{r.kindName}</Tag> : <span className="text-muted-foreground text-body-sm">{ORG_TEXT.kindNone}</span>,
              },
              {
                id: "leader",
                header: ORG_TEXT.colLeader,
                cell: (r: OrgUnitRow) =>
                  r.leaderName ? <span className="text-body-sm">{r.leaderName}</span> : <span className="text-muted-foreground text-body-sm">{ORG_TEXT.leaderNone}</span>,
              },
              {
                id: "members",
                header: ORG_TEXT.colMembers,
                // A unit nobody is in is a fact worth seeing, not a zero.
                cell: (r: OrgUnitRow) =>
                  r.members === 0 ? <Tag>{ORG_TEXT.noMember}</Tag> : <span className="tabular-nums">{ORG_TEXT.members(r.members)}</span>,
              },
            ]}
          />
        </div>
      )}

      <Drawer
        open={details !== null}
        onClose={() => setDetails(null)}
        width="md"
        title={details ? ORG_TEXT.detailsTitle(details.name) : ""}
        description={details ? ORG_TEXT.detailsWhy(details.kindName ?? ORG_TEXT.kindNone, details.leaderName ?? ORG_TEXT.leaderNone) : ""}
        closeLabel={ORG_TEXT.detailsDone}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" onClick={() => setDetails(null)}>{ORG_TEXT.detailsDone}</Button>
            {editable && details ? (
              <Button onClick={() => router.push(`/admin/org/${details.id}`)}>{ORG_TEXT.detailsEdit}</Button>
            ) : null}
          </div>
        }
      >
        <div className="gap-lg flex flex-col">
          <Section title={ORG_TEXT.detailsMembers(placedHere.length)}>
            {placedHere.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{ORG_TEXT.detailsNoMembers}</p>
            ) : (
              <ul className="gap-xs flex flex-wrap">
                {placedHere.map((n) => <li key={n}><Tag>{n}</Tag></li>)}
              </ul>
            )}
          </Section>
          <Section title={ORG_TEXT.detailsChildren(children.length)}>
            {children.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{ORG_TEXT.detailsNoChildren}</p>
            ) : (
              <ul className="gap-xs flex flex-col">
                {children.map((c) => (
                  <li key={c.id} className="gap-xs flex items-center">
                    <span className="text-body">{c.name}</span>
                    {c.kindName ? <Tag>{c.kindName}</Tag> : null}
                    <span className="text-muted-foreground text-body-sm">{ORG_TEXT.members(c.members)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </Drawer>
    </Section>
  );
}
