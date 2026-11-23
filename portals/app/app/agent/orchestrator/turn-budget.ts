import type { ChatMessage, ToolDefinition } from "../atlas/types";
import { estimateTokens } from "./prompt";

/** Per-request counts only. Message estimates include tool receipts; the
 * separate receipt count explains how the prompt grew without keeping text. */
interface EstimatedTurnInput {
  messageTokens: number;
  schemaTokens: number;
  toolResultTokens: number;
}
export interface ModelUsage extends EstimatedTurnInput {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function measureTurnInput(messages: readonly ChatMessage[], tools?: readonly ToolDefinition[]): EstimatedTurnInput {
  let messageTokens = 0, toolResultTokens = 0;
  for (const { content, toolCalls, toolCallId, name, reasoning, role } of messages) {
    const size = estimateTokens(content ?? "") + 4 +
      (toolCalls ? estimateTokens(JSON.stringify(toolCalls)) : 0) +
      (toolCallId ? estimateTokens(toolCallId) : 0) + (name ? estimateTokens(name) : 0) +
      (reasoning?.text ? estimateTokens(reasoning.text) : 0);
    messageTokens += size;
    if (role === "tool") toolResultTokens += size;
  }
  return { messageTokens, schemaTokens: tools?.length ? estimateTokens(JSON.stringify(tools)) : 0, toolResultTokens };
}
