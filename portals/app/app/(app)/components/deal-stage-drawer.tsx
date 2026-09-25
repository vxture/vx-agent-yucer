"use client";

import { Drawer } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { StageControl, type StageControlProps } from "./stage-control";
import { useDealEditor } from "./deal-edit-context";

// 推进阶段 - the stage control in a drawer (deal batch 2, prototype YC-072:
// the button sits in 推进进程's title row). Moving a deal is a flow operation
// made while reading the panel, not a form that squats on it.

export function DealStageDrawer({ onAdvance, onAbandon, ...props }: Omit<StageControlProps, "hideTitle">) {
  const { OPPORTUNITY_TEXT } = useMessages();
  const { open, onOpenChange } = useDealEditor("stage");
  return (
    <Drawer
      open={open}
      onClose={() => onOpenChange(false)}
      width="sm"
      title={OPPORTUNITY_TEXT.advanceTitle}
      description={OPPORTUNITY_TEXT.advanceDescription}
    >
      <StageControl {...props} hideTitle onAdvance={onAdvance} onAbandon={onAbandon} />
    </Drawer>
  );
}
