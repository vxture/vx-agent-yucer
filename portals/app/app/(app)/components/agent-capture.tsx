"use client";

import type { AgentPanelData } from "../lib/board";
import type { AskAnchor } from "../lib/agent-ask";
import { FormAssistSlot, PageAssistantOutlet } from "./form-assist-slot";
import { CopilotChat } from "./copilot-chat";
import { askCopilot } from "../copilot/ask-action";

/** Generic conversations and form-owned drafting share the same frame. */
export function AgentCapture({ canRecord, canAsk, askAnchor, onRecord }: {
  readonly data: AgentPanelData;
  readonly canRecord: boolean;
  readonly canAsk: boolean;
  readonly askAnchor?: AskAnchor;
  readonly onRecord?: (text: string) => Promise<{ ok: boolean; error?: string }>;
  readonly onAttach?: () => void;
}) {
  return <>
    <PageAssistantOutlet>
      <CopilotChat embedded initialMessages={[]} sessionId={null} canAsk={canAsk}
        account={askAnchor?.accountId ? { id: askAnchor.accountId, name: "" } : undefined}
        deal={askAnchor?.opportunityId ? { id: askAnchor.opportunityId, name: "" } : undefined}
        onAsk={askCopilot} onRecord={canRecord ? onRecord : undefined} />
    </PageAssistantOutlet>
    <FormAssistSlot />
  </>;
}
