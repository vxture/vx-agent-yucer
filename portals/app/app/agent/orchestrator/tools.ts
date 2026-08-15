// The copilot's tool surface.
//
// THE LOAD-BEARING DECISION IN THIS FILE: Runos's risk_level maps directly onto
// yucer's human-in-the-loop rule.
//
//   risk_level "read"              -> the copilot may call it directly
//   risk_level "write" | "critical" -> it may only be PROPOSED
//
// The two vocabularies were designed independently and line up exactly, which is
// what lets one rule cover both planes. A capability that changes something is a
// write the agent wants to make, and ADR-003 says every such write becomes an
// agent_action first. Without this mapping, the proposal discipline would cover
// yucer's own tables and quietly not cover anything reached through Runos -
// which is most of what a "super agent" actually does.
//
// So there is exactly one write tool, `propose_action`, and it does not perform
// anything. It records a proposal.

import type { ToolDefinition } from "../atlas/types";
import type { DiscoveredCapability, RiskLevel } from "../runos/types";
import { SUBJECT_TYPES } from "../../domains/copilot/lib/action";

/** The single write path available to the model. */
export const PROPOSE_ACTION_TOOL_NAME = "propose_action";

export const PROPOSE_ACTION_TOOL: ToolDefinition = {
  name: PROPOSE_ACTION_TOOL_NAME,
  description:
    "Propose a change for a human to review. This does NOT perform the change: it records a proposal that a person must accept before anything happens. Use it for every change you want made, including changes you would make through another capability.",
  parameters: {
    type: "object",
    required: ["action_type", "subject_type", "subject_id", "payload", "rationale"],
    properties: {
      action_type: {
        type: "string",
        description: "What to do, e.g. advance_stage, update_forecast_category, draft_email.",
      },
      subject_type: { type: "string", enum: [...SUBJECT_TYPES] },
      subject_id: { type: "string", description: "Id of the object the change applies to." },
      payload: {
        type: "object",
        description: "The concrete change, as the fields that would be written.",
      },
      rationale: {
        type: "string",
        description:
          "Why you are recommending this, in terms a salesperson can check. This is recorded permanently and cannot be edited later.",
      },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
    },
  },
};

export function isDirectlyCallable(risk: RiskLevel): boolean {
  return risk === "read";
}

export interface ToolBinding {
  /** Tool name given to the model. */
  toolName: string;
  capabilityId: string;
  operation: string;
  riskLevel: RiskLevel;
  idempotent: boolean;
}

/**
 * Tool names must survive a round trip through the model, so the dotted
 * capability id and the operation are flattened into one token. The mapping is
 * kept in the binding table rather than parsed back out of the name: a provider
 * that normalizes tool names would otherwise silently break the reverse lookup.
 */
export function toolNameFor(capabilityId: string, operation: string): string {
  return `${capabilityId}__${operation}`.replace(/[^A-Za-z0-9_]/g, "_");
}

export interface ToolSurface {
  definitions: ToolDefinition[];
  /** toolName -> what to actually invoke. */
  bindings: Map<string, ToolBinding>;
  /**
   * Capabilities that exist and are entitled but were withheld from direct call
   * because they change something. Worth surfacing: the model should know it can
   * propose them, and an operator should be able to see why a capability the
   * catalog lists is not in the tool list.
   */
  proposalOnly: ToolBinding[];
}

/**
 * Build the tool surface from discovered capabilities.
 *
 * discover() does not return schemas, so read-risk operations get a permissive
 * object schema here; the caller resolves the full contract before invoking, and
 * Runos validates the arguments against the registered inputSchema anyway. That
 * keeps the discover -> resolve round trip off the hot path for the common case
 * where the model asks about a capability it never calls.
 */
export function buildToolSurface(capabilities: readonly DiscoveredCapability[]): ToolSurface {
  const definitions: ToolDefinition[] = [PROPOSE_ACTION_TOOL];
  const bindings = new Map<string, ToolBinding>();
  const proposalOnly: ToolBinding[] = [];

  for (const cap of capabilities) {
    for (const op of cap.operations ?? []) {
      const binding: ToolBinding = {
        toolName: toolNameFor(cap.capability_id, op.operation),
        capabilityId: cap.capability_id,
        operation: op.operation,
        riskLevel: op.risk_level,
        idempotent: false,
      };

      if (!isDirectlyCallable(op.risk_level)) {
        proposalOnly.push(binding);
        continue;
      }

      bindings.set(binding.toolName, binding);
      definitions.push({
        name: binding.toolName,
        description: [
          op.description,
          cap.use_when ? `Use when: ${cap.use_when}` : "",
          cap.avoid_when ? `Avoid when: ${cap.avoid_when}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        parameters: { type: "object", properties: {}, additionalProperties: true },
      });
    }
  }

  return { definitions, bindings, proposalOnly };
}

export interface ProposalDraft {
  actionType: string;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
  rationale: string;
  confidence: number | null;
}

/**
 * Read a propose_action tool call into a draft.
 *
 * Returns null rather than throwing on a malformed call: a model that produces a
 * bad tool call should be told so and allowed to try again, not crash the turn.
 */
export function readProposalDraft(args: unknown): ProposalDraft | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;

  const actionType = typeof a.action_type === "string" ? a.action_type.trim() : "";
  const subjectType = typeof a.subject_type === "string" ? a.subject_type : "";
  const subjectId = typeof a.subject_id === "string" ? a.subject_id.trim() : "";
  const rationale = typeof a.rationale === "string" ? a.rationale.trim() : "";

  if (!actionType || !subjectId || !rationale) return null;
  if (!(SUBJECT_TYPES as readonly string[]).includes(subjectType)) return null;

  const confidence =
    typeof a.confidence === "number" && Number.isFinite(a.confidence)
      ? Math.min(100, Math.max(0, Math.round(a.confidence)))
      : null;

  return {
    actionType,
    subjectType,
    subjectId,
    payload: (a.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>,
    rationale,
    confidence,
  };
}
