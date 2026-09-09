"use client";

import { Button } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { ROUTING_ANALYSE_EVENT } from "../lib/routing-signal";

// 智能分配 - the copy of the button that sits in the page's title row (owner,
// 2026-09-06: 智能分配按钮 = 分配页面标题行右侧 + 智能助手板块).
//
// IT DOES NOT DO THE WORK. The analysis and its result belong to the assistant
// panel, so this only says "go" - the panel runs it, owns the proposals, and
// is where 采纳 / 重新分析 / 放弃 live. Two buttons producing two independent
// result lists would be the same analysis disagreeing with itself.

export function RoutingAnalyseButton() {
  const { ROUTING_TEXT } = useMessages();
  return (
    <Button
      size="sm"
      onClick={() => window.dispatchEvent(new CustomEvent(ROUTING_ANALYSE_EVENT))}
    >
      {ROUTING_TEXT.assignRun}
    </Button>
  );
}
