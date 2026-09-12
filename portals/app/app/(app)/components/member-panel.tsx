"use client";

import {
  Button,
  DataTable,
  DialogForm,
  Drawer,
  EmptyState,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
  useToast,
} from "@vxture/design-ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, useTableSort } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import { setMemberActive, setMemberInactive } from "../admin/members/actions";
import { handOverBook } from "../admin/members/handover";
import { buildOrgView, type OrgViewUnit } from "../lib/member-org-view";
import { MemberOrgView } from "./member-org-view";
import { MemberViewSwitch, type MemberView } from "./member-view-switch";
import { Tag } from "./tag";

/* 成员管理 - 展示. DISPLAY ONLY, the shape /admin/roles and /admin/org have
 * (owner, 2026-09-10: 展示信息和编辑、新建混合在一个页面，大bug).
 *
 * WHAT IT REPLACES. The roster carried a grant select and a remove button
 * per role, a scope select with a territory select under it, a unit select,
 * and the lifecycle buttons - six write paths inline on a page whose job is
 * to state who is here. Every one of them is now either the form on
 * /admin/members/[id] (成员配置: roles, unit, scope) or a row operation
 * behind a confirmation (停用 / 恢复在岗 / 转交客户).
 *
 * THE ROSTER STATES: name, roles as tags (无角色 called out - that person
 * opens the product and finds nothing), units, scope, standing. 成员详情 is
 * a drawer, view-only, for every reader; 编辑 in its foot goes to the form.
 *
 * TWO VIEWS OF THE SAME PEOPLE (owner, 2026-09-10: 清单视图、组织视图). The
 * switch is in the section's action slot and the choice is in the URL
 * (`?view=org`), like the drawer's `?details=`, so it survives every refresh
 * an operation causes. The org view is the organisation's tree table with
 * the same rows under the units they are placed in - several per person
 * since 0053 - names only, and 添加成员 / 移出成员 on each unit's row; the
 * drawer and the person's form stay the roster's.
 *
 * MARKED, NOT HIDDEN. A departed member keeps their row forever - it is the
 * only thing that maps this sub to a name, and every signature in the audit
 * trail reads through it.
 */

export interface MemberRow {
  readonly memberId: string;
  readonly sub: string;
  readonly name: string;
  /** Role codes held, and their names in the workspace's own words. */
  readonly roles: readonly { readonly code: string; readonly name: string; readonly admin: boolean }[];
  readonly status: string;
  /** The units they are placed in (0051; several since 0053), in tree order. */
  readonly units: readonly { readonly id: string; readonly name: string }[];
  readonly scope: string;
  /** Assigned territories, by name - for the territory scope. */
  readonly territories: readonly string[];
}

const SORT_ON = { member: (r: MemberRow) => r.name };

export function MemberPanel({ rows, canManage, orgUnits, roleOptions }: {
  readonly rows: readonly MemberRow[];
  readonly canManage: boolean;
  /** The organisation, in tree order, for the org view. */
  readonly orgUnits: readonly OrgViewUnit[];
  /** The workspace's roles, in its order - 添加到单位's 新角色. */
  readonly roleOptions: readonly { readonly code: string; readonly name: string; readonly admin: boolean }[];
}) {
  const { DATA_TABLE_LABELS, MEMBER_ERROR, MEMBER_TEXT, ROW_OPS } = useMessages();
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const sorted = useTableSort<MemberRow>(rows, SORT_ON);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  /* WHICH MEMBER THE DRAWER SHOWS IS IN THE URL (`?details=<sub>`), as on
     the other rosters: it survives the refresh every operation causes. */
  const details = useMemo(() => {
    const sub = params.get("details");
    return sub ? (rows.find((r) => r.sub === sub) ?? null) : null;
  }, [params, rows]);
  const setDetails = (r: MemberRow | null) => {
    const next = new URLSearchParams(params.toString());
    if (r) next.set("details", r.sub);
    else next.delete("details");
    const qs = next.toString();
    router.replace(qs ? `/admin/members?${qs}` : "/admin/members", { scroll: false });
  };
  /* 组织 IS THE DEFAULT (owner, 2026-09-10): no `?view` means the tree;
     `?view=list` is the roster. */
  const view: MemberView = params.get("view") === "list" ? "list" : "org";
  const setView = (v: MemberView) => {
    const next = new URLSearchParams(params.toString());
    if (v === "list") next.set("view", "list");
    else next.delete("view");
    const qs = next.toString();
    router.replace(qs ? `/admin/members?${qs}` : "/admin/members", { scroll: false });
  };
  /* THE TREE HOLDS THE PEOPLE IN STANDING; the departed are listed apart
     under it (owner, 2026-09-10). */
  const people = useMemo(
    () => rows.map((r) => ({ sub: r.sub, name: r.name, status: r.status, unitIds: r.units.map((u) => u.id), scope: r.scope, territories: r.territories })),
    [rows],
  );
  const orgView = useMemo(() => buildOrgView(orgUnits, people.filter((p) => p.status !== "inactive")), [orgUnits, people]);
  const inactivePeople = useMemo(() => people.filter((p) => p.status === "inactive"), [people]);
  const openBySub = (sub: string) => setDetails(rows.find((r) => r.sub === sub) ?? null);
  const rolesOf = useMemo(() => new Map(rows.map((r) => [r.sub, r.roles])), [rows]);

  // Counted over the whole table so the guard reads the same fact the service
  // does: "is anyone else able to administer this workspace".
  const adminCount = rows.filter((m) => m.status === "active" && m.roles.some((r) => r.admin)).length;
  const isLastAdmin = (r: MemberRow) => r.status === "active" && r.roles.some((x) => x.admin) && adminCount <= 1;

  const deactivate = async (r: MemberRow) => {
    const res = await setMemberInactive(r.sub);
    if (!res.ok) {
      toast({ tone: "danger", title: MEMBER_ERROR[res.error ?? "denied"] ?? res.error ?? "denied" });
      throw new Error(res.error);
    }
    router.refresh();
  };
  const reactivate = (r: MemberRow) =>
    start(async () => {
      const res = await setMemberActive(r.sub);
      if (!res.ok) toast({ tone: "danger", title: MEMBER_ERROR[res.error ?? "denied"] ?? res.error ?? "denied" });
      else router.refresh();
    });

  /* 转交客户 - a FLOW operation, so a dialog (the 2026-09-05 ruling): who
     receives the book, then one confirmation. Offered only on an inactive
     row; a member still here has their records reassigned one by one. */
  const [handing, setHanding] = useState<MemberRow | null>(null);
  const [heir, setHeir] = useState("");
  const heirs = rows.filter((m) => m.status === "active" && m.sub !== handing?.sub);
  const handover = () =>
    start(async () => {
      if (!handing) return;
      const res = await handOverBook(handing.sub, heir);
      if (!res.ok) {
        toast({ tone: "danger", title: MEMBER_ERROR[res.error ?? "denied"] ?? res.error ?? "denied" });
        return;
      }
      // WHAT ACTUALLY MOVED, said out loud - and the refused rows, which are
      // the half that matters: a lead the rule would not move is still owned
      // by somebody who has left.
      const m = res.moved;
      const parts = m ? [MEMBER_TEXT.handoverDone(m.accounts, m.opportunities, m.leads)] : [];
      if (res.skipped && res.skipped.length > 0) parts.push(MEMBER_TEXT.handoverPartial(res.skipped.length));
      toast({ tone: res.skipped && res.skipped.length > 0 ? "warning" : "success", title: parts.join(" ") });
      setHanding(null);
      setHeir("");
      router.refresh();
    });

  const scopeLabel = (r: MemberRow) => MEMBER_TEXT.scopeLabels[r.scope] ?? r.scope;

  return (
    <Section id="members">
      {/* THE TOOLBAR ROW, as the permission tree draws its own: the DS's
          Section renders its header - and with it the action slot - only
          when it has a title, so a switch put in `action` on an untitled
          section is empty air (which is how 组织结构's 全部展开 went missing).
          The switch sits at the LEFT end (owner: 切换按钮居左); the org view
          draws its own toolbar with the switch and its actions. */}
      {rows.length === 0 ? (
        <EmptyState title={MEMBER_TEXT.emptyTitle} description={MEMBER_TEXT.emptyDescription} />
      ) : view === "org" ? (
        <MemberOrgView
          view={orgView}
          inactive={inactivePeople}
          canManage={canManage}
          roster={rows.filter((r) => r.status === "active").map((r) => ({ sub: r.sub, name: r.name }))}
          roleOptions={roleOptions}
          rolesOf={rolesOf}
          viewValue={view}
          onViewChange={setView}
          onOpen={openBySub}
          onConfigure={(sub) => { const r = rows.find((x) => x.sub === sub); if (r) router.push(`/admin/members/${r.memberId}`); }}
          onReactivate={(sub) => { const r = rows.find((x) => x.sub === sub); if (r) reactivate(r); }}
        />
      ) : (
        <div className="gap-md flex flex-col">
        <div className="gap-sm flex items-center">
          <MemberViewSwitch
            value={view}
            onChange={setView}
            ariaLabel={MEMBER_TEXT.viewAria}
            labels={{ list: MEMBER_TEXT.viewList, org: MEMBER_TEXT.viewOrg }}
          />
        </div>
        <div
          className={
            /* 首列 30% (owner, 表格列宽新一轮规则: 首列按业务列数量分档 -
               成员/角色/单位/数据范围/状态五个业务列落在 "5-6 列→30%" 这档)。
               角色列继续留白自适应，撑起表格宽度守卫要求的"至少一列不钉
               宽度"。 */
            `[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN}`
            + " [&_thead_th:nth-child(3)]:w-[30%]"
            + " [&_thead_th:nth-child(5)]:w-[9rem]"
            + " [&_thead_th:nth-child(6)]:w-[7rem]"
            + " [&_thead_th:nth-child(7)]:w-[6rem]"
          }
        >
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={1}
            selectedKeys={selected}
            onSelectionChange={(keys) => setSelected([...keys])}
            sort={sorted.sort}
            onSortChange={sorted.onSortChange}
            rowActions={(r: MemberRow) => (
              <RowActions
                disabled={pending}
                items={[
                  { id: "details", label: ROW_OPS.details(MEMBER_TEXT.noun), onSelect: () => setDetails(r) },
                  ...(canManage
                    ? [
                        { id: "edit", label: ROW_OPS.configure(MEMBER_TEXT.noun), onSelect: () => router.push(`/admin/members/${r.memberId}`) },
                        ...(r.status === "inactive"
                          ? [
                              { id: "reactivate", label: MEMBER_TEXT.reactivate, separatorBefore: true, onSelect: () => reactivate(r) },
                              {
                                id: "handover",
                                label: MEMBER_TEXT.handoverMenu,
                                disabled: heirs.length === 0 && rows.filter((m) => m.status === "active").length === 0,
                                onSelect: () => { setHeir(""); setHanding(r); },
                              },
                            ]
                          : [
                              /* THE LAST ADMINISTRATOR, greyed here and refused
                                 again in the service: deactivating them leaves a
                                 workspace nobody can administer, with no way back. */
                              {
                                id: "deactivate",
                                label: MEMBER_TEXT.deactivateMenu,
                                separatorBefore: true,
                                danger: true as const,
                                disabled: isLastAdmin(r),
                                hint: isLastAdmin(r) ? MEMBER_TEXT.lastAdminHint : undefined,
                                confirm: {
                                  verb: MEMBER_TEXT.deactivateMenu,
                                  target: MEMBER_TEXT.deactivateTarget(r.name),
                                  consequence: MEMBER_TEXT.deactivateHint,
                                  titleTemplate: MEMBER_TEXT.destructiveTitle,
                                  cancelLabel: MEMBER_TEXT.cancel,
                                  onConfirm: () => deactivate(r),
                                },
                              },
                            ]),
                      ]
                    : []),
                ]}
              />
            )}
            rowKey={(r: MemberRow) => r.memberId}
            rows={[...sorted.rows]}
            columns={[
              {
                id: "member",
                sortable: true,
                header: MEMBER_TEXT.columnMember,
                cell: (r: MemberRow) => (
                  <button
                    type="button"
                    className="cursor-pointer text-left"
                    aria-label={MEMBER_TEXT.detailsTitle(r.name)}
                    onClick={() => setDetails(r)}
                  >
                    <TableTitleCell
                      title={r.name}
                      tooltip={r.name}
                      description={r.sub}
                      titleSuffix={r.status === "inactive" ? <Tag>{MEMBER_TEXT.inactive}</Tag> : undefined}
                    />
                  </button>
                ),
              },
              {
                id: "roles",
                header: MEMBER_TEXT.columnRoles,
                cell: (r: MemberRow) =>
                  r.roles.length === 0 ? (
                    <StatusBadge tone="warning" dot>{MEMBER_TEXT.noRoles}</StatusBadge>
                  ) : (
                    <span className="gap-2xs flex flex-wrap">
                      {r.roles.map((x) => (
                        <Tag key={x.code} tone={x.admin ? "info" : "neutral"}>{x.name}</Tag>
                      ))}
                    </span>
                  ),
              },
              {
                id: "unit",
                header: MEMBER_TEXT.columnUnit,
                // Several units read as tags, in tree order (0053).
                cell: (r: MemberRow) =>
                  r.units.length === 0 ? (
                    <span className="text-muted-foreground text-body-sm">{MEMBER_TEXT.unitNone}</span>
                  ) : (
                    <span className="gap-2xs flex flex-wrap">
                      {r.units.map((u) => <Tag key={u.id}>{u.name}</Tag>)}
                    </span>
                  ),
              },
              {
                id: "scope",
                header: MEMBER_TEXT.columnScope,
                cell: (r: MemberRow) => (
                  <span className="gap-3xs flex flex-col">
                    <span className="text-body-sm">{scopeLabel(r)}</span>
                    {r.scope === "unit" && r.units.length === 0 ? (
                      <span className="text-warning text-body-sm">{MEMBER_TEXT.scopeUnitUnplaced}</span>
                    ) : null}
                  </span>
                ),
              },
              {
                id: "status",
                header: MEMBER_TEXT.columnLifecycle,
                cell: (r: MemberRow) =>
                  r.status === "inactive" ? <Tag>{MEMBER_TEXT.inactive}</Tag> : <StatusBadge tone="success">{MEMBER_TEXT.active}</StatusBadge>,
              },
            ]}
          />
        </div>
        </div>
      )}

      <Drawer
        open={details !== null}
        onClose={() => setDetails(null)}
        width="md"
        title={details ? MEMBER_TEXT.detailsTitle(details.name) : ""}
        description={details ? details.sub : ""}
        closeLabel={MEMBER_TEXT.detailsDone}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" onClick={() => setDetails(null)}>{MEMBER_TEXT.detailsDone}</Button>
            {canManage && details ? (
              <Button onClick={() => router.push(`/admin/members/${details.memberId}`)}>{MEMBER_TEXT.detailsEdit}</Button>
            ) : null}
          </div>
        }
      >
        {details ? (
          <dl className="gap-md grid grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-muted-foreground text-body-sm">{MEMBER_TEXT.columnLifecycle}</dt>
            <dd>{details.status === "inactive" ? <Tag>{MEMBER_TEXT.inactive}</Tag> : <StatusBadge tone="success">{MEMBER_TEXT.active}</StatusBadge>}</dd>
            <dt className="text-muted-foreground text-body-sm">{MEMBER_TEXT.columnRoles}</dt>
            <dd>
              {details.roles.length === 0 ? (
                <StatusBadge tone="warning" dot>{MEMBER_TEXT.noRoles}</StatusBadge>
              ) : (
                <span className="gap-2xs flex flex-wrap">
                  {details.roles.map((x) => <Tag key={x.code} tone={x.admin ? "info" : "neutral"}>{x.name}</Tag>)}
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground text-body-sm">{MEMBER_TEXT.columnUnit}</dt>
            <dd>
              {details.units.length === 0 ? (
                <span className="text-muted-foreground text-body-md">{MEMBER_TEXT.unitNone}</span>
              ) : (
                <span className="gap-2xs flex flex-wrap">
                  {details.units.map((u) => <Tag key={u.id}>{u.name}</Tag>)}
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground text-body-sm">{MEMBER_TEXT.columnScope}</dt>
            <dd className="gap-3xs flex flex-col">
              <span className="text-body-md">{scopeLabel(details)}</span>
              {details.scope === "territory" ? (
                <span className="text-muted-foreground text-body-sm">
                  {details.territories.length > 0 ? details.territories.join(" / ") : MEMBER_TEXT.territoriesNone}
                </span>
              ) : null}
              {details.scope === "unit" && details.units.length === 0 ? (
                <span className="text-warning text-body-sm">{MEMBER_TEXT.scopeUnitUnplaced}</span>
              ) : null}
            </dd>
          </dl>
        ) : null}
      </Drawer>

      <DialogForm
        open={handing !== null}
        onOpenChange={(open) => { if (!open) setHanding(null); }}
        title={handing ? MEMBER_TEXT.handoverTitle(handing.name) : ""}
        description={MEMBER_TEXT.handoverHint}
        submitLabel={MEMBER_TEXT.handoverConfirm}
        cancelLabel={MEMBER_TEXT.cancel}
        submitDisabled={heir === "" || pending}
        onSubmit={(e) => { e.preventDefault(); handover(); }}
      >
        {heirs.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{MEMBER_TEXT.handoverNoHeir}</p>
        ) : (
          <NativeSelect aria-label={MEMBER_TEXT.handoverTo} value={heir} onChange={(e) => setHeir(e.target.value)}>
            <option value="">{MEMBER_TEXT.handoverTo}</option>
            {heirs.map((m) => (
              <option key={m.sub} value={m.sub}>{m.name}</option>
            ))}
          </NativeSelect>
        )}
      </DialogForm>
    </Section>
  );
}
