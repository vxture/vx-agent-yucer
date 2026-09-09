"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Drawer, EmptyState, useToast } from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/i18n/provider";
import { buildPermissionTree } from "../lib/permission-tree";
import { saveRoleAction } from "../admin/roles/actions";
import type { PermCode } from "../../authz/catalog";
import { PermissionTreeTable, type PermissionView } from "./permission-tree";

/* 权限详情 - one role's permissions as the four-level tree, in a drawer
 * (owner, 2026-09-09: 点击角色名，抽屉模式展示树状权限清单; 按表格模式优化，能
 * 操作树展开收起).
 *
 * THE ROSTER DOES NOT LIST GRANTS (owner: 不显示所有权限名称). It gives a
 * sentence and a count; the tree is here, one click away, and it is the SAME
 * tree /admin/permissions draws for every role at once - built off the action
 * catalogue, never typed in - read for one role. What the reader usually
 * wants is "what can this role do", so the table opens pruned to what it can
 * and the switch on the toolbar shows everything.
 *
 * EDITING HAPPENS HERE, IN THE SAME DRAWER (owner: 底部需要编辑按钮，并保持
 * 抽屉打开). 编辑 turns every operation's 持有 mark into a checkbox bound to
 * the permission it needs; 保存 writes the grants and the drawer stays open
 * on the same role, now reading what was just decided; 取消 puts the draft
 * down. It never leaves the page - the earlier version hopped to the form
 * and back, and that was a mess. The form on /admin/roles/[id] remains the
 * place for the code, the name and the sentence.
 */
export interface DrawerRole {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

export function RolePermissionsDrawer({
  role,
  total,
  open,
  onClose,
  editable,
}: {
  readonly role: DrawerRole | null;
  /** How many permissions the catalogue has - the denominator. */
  readonly total: number;
  readonly open: boolean;
  readonly onClose: () => void;
  /** May this reader change the grants (admin.role.upsert)? */
  readonly editable: boolean;
}) {
  const { ROLE_ERROR, ROLE_TEXT } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const tree = useMemo(() => buildPermissionTree(), []);
  const [view, setView] = useState<PermissionView>("granted");
  /* The draft: null while viewing, the working set while editing. */
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const held = useMemo(() => draft ?? new Set(role?.permissions ?? []), [draft, role]);
  const editing = draft !== null;

  const close = () => {
    setDraft(null);
    onClose();
  };
  const toggle = (p: PermCode) =>
    setDraft((prev) => {
      const next = new Set(prev ?? role?.permissions ?? []);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const save = () => {
    if (!role || !draft) return;
    start(async () => {
      const r = await saveRoleAction({
        code: role.code,
        name: role.name,
        description: role.description,
        permissions: [...draft],
      });
      if (!r.ok) {
        toast({ tone: "danger", title: ROLE_TEXT.saveFailed, description: ROLE_ERROR[r.error] ?? r.error });
        return;
      }
      toast({ tone: "success", title: ROLE_TEXT.detailsSaved(role.name, draft.size, total) });
      setDraft(null);
      // The roster and this drawer read the same rows; refresh brings the
      // saved grants back through them.
      router.refresh();
    });
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      width="lg"
      title={role ? (editing ? ROLE_TEXT.detailsEditTitle(role.name) : ROLE_TEXT.detailsTitle(role.name)) : ""}
      description={
        role
          ? editing
            ? ROLE_TEXT.detailsEditWhy
            : ROLE_TEXT.detailsWhy(role.permissions.length, total)
          : ""
      }
      closeLabel={ROLE_TEXT.detailsDone}
      footer={
        <div className="gap-sm flex items-center justify-between">
          {/* While editing the left reads the draft's count, so the person
              sees what 保存 will write before writing it. */}
          <span className="text-muted-foreground text-body-sm">
            {editing ? ROLE_TEXT.chosen(held.size) : ""}
          </span>
          <div className="gap-sm flex items-center">
            {editing ? (
              <>
                <Button variant="secondary" disabled={pending} onClick={() => setDraft(null)}>
                  {ROLE_TEXT.cancel}
                </Button>
                <Button disabled={pending} onClick={save}>
                  {ROLE_TEXT.detailsSave}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={close}>{ROLE_TEXT.detailsDone}</Button>
                {editable && role ? (
                  <Button onClick={() => setDraft(new Set(role.permissions))}>{ROLE_TEXT.detailsEdit}</Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      }
    >
      {held.size === 0 && !editing ? (
        <EmptyState title={ROLE_TEXT.pickEmpty} description={ROLE_TEXT.detailsEmpty} />
      ) : (
        <PermissionTreeTable
          tree={tree}
          held={held}
          view={view}
          onViewChange={setView}
          onToggle={editing ? toggle : undefined}
        />
      )}
    </Drawer>
  );
}
