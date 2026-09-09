"use client";

import { useMemo, useState } from "react";
import { Button, Drawer, EmptyState } from "@vxture/design-ui";
import { useRouter } from "next/navigation";
import { useMessages } from "../lib/i18n/provider";
import { buildPermissionTree } from "../lib/permission-tree";
import { PermissionTreeTable, type PermissionView } from "./permission-tree";

/* 权限详情 - one role's permissions as the four-level tree, in a drawer
 * (owner, 2026-09-09: 点击角色名，抽屉模式展示树状权限清单; 按表格模式优化，能
 * 操作树展开收起).
 *
 * VIEW ONLY. There is ONE place a role is edited - the form on
 * /admin/roles/[id] - and 编辑 in this foot goes there (owner: 跳转编辑界面，
 * 需权限). Two versions of this drawer tried to be cleverer: one hopped to
 * the form and back into the drawer, one edited the grants in place beside
 * the form. Both gave the product two ways to edit a role, and the owner
 * called it what it was. A drawer that shows is a drawer that shows.
 *
 * THE ROSTER DOES NOT LIST GRANTS (owner: 不显示所有权限名称). It gives a
 * sentence and a count; the tree is here, one click away, and it is the SAME
 * tree /admin/permissions draws for every role at once - built off the action
 * catalogue, never typed in - read for one role. What the reader usually
 * wants is "what can this role do", so the table opens pruned to what it can
 * and the switch on the toolbar shows everything.
 */
export function RolePermissionsDrawer({
  role,
  total,
  open,
  onClose,
  editHref,
}: {
  readonly role: { readonly name: string; readonly permissions: readonly string[] } | null;
  /** How many permissions the catalogue has - the denominator. */
  readonly total: number;
  readonly open: boolean;
  readonly onClose: () => void;
  /** The form's address, for a reader who may edit; null otherwise. */
  readonly editHref: string | null;
}) {
  const { ROLE_TEXT } = useMessages();
  const router = useRouter();
  const tree = useMemo(() => buildPermissionTree(), []);
  const held = useMemo(() => new Set(role?.permissions ?? []), [role]);
  const [view, setView] = useState<PermissionView>("granted");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={role ? ROLE_TEXT.detailsTitle(role.name) : ""}
      description={role ? ROLE_TEXT.detailsWhy(role.permissions.length, total) : ""}
      closeLabel={ROLE_TEXT.detailsDone}
      footer={
        <div className="gap-sm flex items-center justify-end">
          <Button variant="secondary" onClick={onClose}>{ROLE_TEXT.detailsDone}</Button>
          {editHref ? (
            <Button onClick={() => router.push(editHref)}>{ROLE_TEXT.detailsEdit}</Button>
          ) : null}
        </div>
      }
    >
      {held.size === 0 ? (
        <EmptyState title={ROLE_TEXT.pickEmpty} description={ROLE_TEXT.detailsEmpty} />
      ) : (
        <PermissionTreeTable tree={tree} held={held} view={view} onViewChange={setView} />
      )}
    </Drawer>
  );
}
