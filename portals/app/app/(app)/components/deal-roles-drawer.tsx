"use client";

import { Drawer } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { BuyingRoleForm, type BuyingRoleFormProps } from "./buying-role-form";
import { useDealEditor } from "./deal-edit-context";

// 编辑决策角色 - the buying-role form in a drawer (deal batch 2). It used to
// sit open under the chain on the page; 决策流程 in 栏1 is display now, and
// its "⋮" 编辑 opens this - the customer page's 展示/编辑拆解.

export function DealRolesDrawer({ onSave, ...props }: Omit<BuyingRoleFormProps, "hideTitle">) {
  const { BUYING_ROLE_TEXT } = useMessages();
  const { open, onOpenChange } = useDealEditor("roles");
  if (!props.canEdit) return null;
  return (
    <Drawer
      open={open}
      onClose={() => onOpenChange(false)}
      width="sm"
      title={BUYING_ROLE_TEXT.title}
      description={BUYING_ROLE_TEXT.description}
    >
      <BuyingRoleForm {...props} hideTitle onSave={onSave} />
    </Drawer>
  );
}
