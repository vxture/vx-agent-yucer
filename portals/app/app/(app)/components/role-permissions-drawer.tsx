"use client";

import { useMemo, useState } from "react";
import { Button, Drawer, EmptyState, SegmentedControl } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { buildPermissionTree } from "../lib/permission-tree";
import { PermissionTreeList } from "./permission-tree";

/* 权限详情 - one role's permissions as the four-level tree, in a drawer
 * (owner, 2026-09-09: 点击操作/权限详情，抽屉模式展示树状权限清单).
 *
 * THE ROSTER DOES NOT LIST GRANTS (owner: 不显示所有权限名称). It gives a
 * sentence and a count; the tree is here, one click away, and it is the SAME
 * tree /admin/permissions draws for every role at once - built off the action
 * catalogue, never typed in - read for one role. What the reader usually
 * wants is "what can this role do", so the list opens pruned to what it can
 * and one switch shows everything.
 */
export function RolePermissionsDrawer({
  role,
  total,
  open,
  onClose,
}: {
  readonly role: { readonly name: string; readonly permissions: readonly string[] } | null;
  /** How many permissions the catalogue has - the denominator. */
  readonly total: number;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { ROLE_TEXT } = useMessages();
  const tree = useMemo(() => buildPermissionTree(), []);
  const held = useMemo(() => new Set(role?.permissions ?? []), [role]);
  const [view, setView] = useState<"granted" | "all">("granted");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={role ? ROLE_TEXT.detailsTitle(role.name) : ""}
      description={role ? ROLE_TEXT.detailsWhy(role.permissions.length, total) : ""}
      closeLabel={ROLE_TEXT.detailsDone}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>{ROLE_TEXT.detailsDone}</Button>
        </div>
      }
    >
      <div className="gap-md flex flex-col">
        {held.size === 0 ? (
          <EmptyState title={ROLE_TEXT.pickEmpty} description={ROLE_TEXT.detailsEmpty} />
        ) : (
          <>
            <SegmentedControl<"granted" | "all">
              value={view}
              onChange={setView}
              ariaLabel={ROLE_TEXT.details}
              items={[
                { value: "granted", label: ROLE_TEXT.detailsOnlyGranted },
                { value: "all", label: ROLE_TEXT.detailsAll },
              ]}
            />
            <PermissionTreeList tree={tree} held={held} onlyGranted={view === "granted"} />
          </>
        )}
      </div>
    </Drawer>
  );
}
