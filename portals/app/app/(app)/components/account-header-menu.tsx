"use client";

import { ActionMenu } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useAccountEdit } from "./account-edit-context";

// 客户总编辑 - the breadcrumb row's "⋮". The drawers it opens now live in
// account-edit-context.tsx, shared with the panels' own menus (owner,
// 2026-09-23), so this is only the menu.

export function AccountHeaderMenu() {
  const { DS_LABELS, POSITION_TEXT, ACCOUNT_BASICS_TEXT, COLLABORATOR_TEXT } = useMessages();
  const edit = useAccountEdit();
  if (!edit || !edit.canWrite) return null;
  return (
    <ActionMenu
      label={DS_LABELS.actionMenu}
      items={[
        { id: "tier", label: POSITION_TEXT.designateMenu, onSelect: () => edit.open("tier") },
        { id: "basics", label: ACCOUNT_BASICS_TEXT.editButton, onSelect: () => edit.open("basics") },
        { id: "owner", label: COLLABORATOR_TEXT.editButton, onSelect: () => edit.open("owner") },
      ]}
    />
  );
}
