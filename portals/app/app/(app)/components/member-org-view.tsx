"use client";

import { Button, ButtonGroup, Checkbox, DataTable, DialogForm, Icon, TableTitleCell, useToast } from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import { branchIds, flattenOrgView, type OrgView, type OrgViewRow } from "../lib/member-org-view";
import { placeMembersInUnit } from "../admin/members/actions";
import { Tag } from "./tag";

/* 组织视图 - THE TREE, with the people in it (owner, 2026-09-10: 按组织视图不是
 * 树状结构吗，差别就是在各单位内可以添加成员).
 *
 * THE SAME TREE TABLE 组织结构 draws - one DataTable in tree order, indented
 * by depth, a chevron on every branch - with two differences: the unit
 * column carries the NAME ONLY (只显示主名称: no code, kind or leader; those
 * are the org page's), and the row holds the people placed in that unit,
 * each opening 成员详情. The 未归属 row comes last, for whoever is placed
 * nowhere.
 *
 * THE ROW OPERATIONS, for an administrator: 添加成员 - tick the active
 * members to place here - and 移出成员. Both go through one server action
 * that rewrites each person's SET of units (0053), so a person added here
 * keeps their other units. The form on /admin/members/[id] is the other way
 * to the same fact, from the person's side.
 */

export function MemberOrgView({ view, canManage, roster, onOpen }: {
  readonly view: OrgView;
  readonly canManage: boolean;
  /** Everyone active, for 添加成员's pick list. */
  readonly roster: readonly { readonly sub: string; readonly name: string }[];
  readonly onOpen: (sub: string) => void;
}) {
  const { DATA_TABLE_LABELS, MEMBER_ERROR, MEMBER_TEXT } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const rows = useMemo(() => flattenOrgView(view, collapsed), [view, collapsed]);
  const branches = useMemo(() => branchIds(view), [view]);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* THE DIALOG: which unit, which way, and the ticks. */
  const [dialog, setDialog] = useState<{ row: OrgViewRow; mode: "add" | "remove" } | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const open = (row: OrgViewRow, mode: "add" | "remove") => {
    setTicked(new Set());
    setDialog({ row, mode });
  };
  const candidates = useMemo(() => {
    if (!dialog) return [];
    const here = new Set(dialog.row.people.map((p) => p.sub));
    return dialog.mode === "add"
      ? roster.filter((m) => !here.has(m.sub))
      : dialog.row.people.map((p) => ({ sub: p.sub, name: p.name }));
  }, [dialog, roster]);
  const tick = (sub: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub);
      else next.add(sub);
      return next;
    });
  const submit = () =>
    start(async () => {
      if (!dialog) return;
      const res = await placeMembersInUnit(dialog.row.id, [...ticked], dialog.mode);
      if (!res.ok) {
        toast({ tone: "danger", title: MEMBER_ERROR[res.error ?? "denied"] ?? res.error ?? "denied" });
        return;
      }
      toast({
        tone: "success",
        title: dialog.mode === "add" ? MEMBER_TEXT.orgPlaced(ticked.size, dialog.row.name) : MEMBER_TEXT.orgRemoved(ticked.size, dialog.row.name),
      });
      setDialog(null);
      router.refresh();
    });

  return (
    <div className="gap-md flex flex-col">
      <div className="gap-sm flex items-center justify-end">
        <ButtonGroup>
          <Button variant="secondary" size="sm" onClick={() => setCollapsed(new Set())}>{MEMBER_TEXT.orgExpandAll}</Button>
          <Button variant="secondary" size="sm" onClick={() => setCollapsed(new Set(branches))}>{MEMBER_TEXT.orgCollapseAll}</Button>
        </ButtonGroup>
      </div>
      <div className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} [&_thead_th:nth-child(3)]:w-[18rem] [&_thead_th:nth-child(5)]:w-[5rem]`}>
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={(keys) => setSelected([...keys])}
          rowKey={(r: OrgViewRow) => r.id}
          rows={rows}
          rowActions={(r: OrgViewRow) => (
            <RowActions
              disabled={pending}
              items={
                canManage && !r.unplaced
                  ? [
                      { id: "add", label: MEMBER_TEXT.orgAdd, onSelect: () => open(r, "add") },
                      { id: "remove", label: MEMBER_TEXT.orgRemove, disabled: r.people.length === 0, onSelect: () => open(r, "remove") },
                    ]
                  : []
              }
            />
          )}
          columns={[
            {
              /* THE TREE COLUMN, as 组织结构 draws it: indent, chevron, the
                 DS's title cell - the name and nothing under it. */
              id: "unit",
              header: MEMBER_TEXT.orgColUnit,
              cell: (r: OrgViewRow) => (
                <span className="gap-xs flex items-center" style={{ paddingLeft: `${r.depth * 1.5}rem` }}>
                  {r.children > 0 ? (
                    <Button variant="ghost" size="icon-sm" aria-expanded={!collapsed.has(r.id)} aria-label={r.name} onClick={() => toggle(r.id)}>
                      <Icon name={collapsed.has(r.id) ? "chevron-right" : "chevron-down"} size="sm" />
                    </Button>
                  ) : (
                    <span className="w-8 shrink-0" />
                  )}
                  {r.unplaced ? (
                    <TableTitleCell title={MEMBER_TEXT.orgUnplaced} description={MEMBER_TEXT.orgUnplacedWhy} />
                  ) : (
                    <TableTitleCell title={r.name} tooltip={r.name} titleSuffix={<Tag>{MEMBER_TEXT.orgHeadcount(r.people.length)}</Tag>} />
                  )}
                </span>
              ),
            },
            {
              /* THE PEOPLE placed here, by name, each opening 成员详情. */
              id: "people",
              header: MEMBER_TEXT.orgColMembers,
              cell: (r: OrgViewRow) =>
                r.people.length === 0 ? (
                  <span className="text-muted-foreground text-body-sm">{MEMBER_TEXT.orgNoMembers}</span>
                ) : (
                  <ul className="gap-x-md gap-y-xs flex flex-wrap">
                    {r.people.map((p) => (
                      <li key={p.sub} className="gap-2xs flex items-center">
                        <button
                          type="button"
                          className="text-body-md cursor-pointer text-left hover:underline"
                          aria-label={MEMBER_TEXT.detailsTitle(p.name)}
                          onClick={() => onOpen(p.sub)}
                        >
                          {p.name}
                        </button>
                        {p.status === "inactive" ? <Tag>{MEMBER_TEXT.inactive}</Tag> : null}
                      </li>
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      </div>

      <DialogForm
        open={dialog !== null}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title={dialog ? (dialog.mode === "add" ? MEMBER_TEXT.orgAddTitle(dialog.row.name) : MEMBER_TEXT.orgRemoveTitle(dialog.row.name)) : ""}
        description={dialog?.mode === "remove" ? MEMBER_TEXT.orgRemoveWhy : MEMBER_TEXT.orgAddWhy}
        submitLabel={MEMBER_TEXT.orgConfirm}
        cancelLabel={MEMBER_TEXT.cancel}
        submitDisabled={ticked.size === 0 || pending}
        danger={dialog?.mode === "remove"}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        {candidates.length === 0 ? (
          <p className="text-muted-foreground text-body-md">{MEMBER_TEXT.orgAddNone}</p>
        ) : (
          <div className="gap-2xs md:grid-cols-2 grid grid-cols-1">
            {candidates.map((m) => (
              <label className="gap-2xs flex items-center" key={m.sub} htmlFor={`place-${m.sub}`}>
                <Checkbox id={`place-${m.sub}`} checked={ticked.has(m.sub)} disabled={pending} onCheckedChange={() => tick(m.sub)} />
                <span className="text-body-md">{m.name}</span>
              </label>
            ))}
          </div>
        )}
      </DialogForm>
    </div>
  );
}
