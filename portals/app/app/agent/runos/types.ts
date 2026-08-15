// Runos capability-plane wire types (Runos interface reference, sections 07-09).
//
// Runos is the L1 commercial capability plane: everything the copilot can DO
// that is not model inference - connectors to third-party systems, reusable
// skills, sandboxed executors - is consumed through its gateway. Atlas decides
// how smart the agent is; Runos decides what it can reach.
//
// A NAMING SEAM TO KNOW ABOUT. Runos runs two field-naming styles on purpose:
// the MCP consumer face is snake_case (capability_id, use_when, risk_level) and
// the REST operator face is camelCase. The seam even runs through a single
// response: runos_resolve returns snake_case at the top level and a camelCase
// `contract` object inside it. These types mirror the wire exactly rather than
// normalizing, because normalizing would hide which face a field came from and
// make the next contract addition ambiguous.
//
// TOLERATE THE UNKNOWN. The v1.0 contract is frozen and evolves additively:
// unknown fields and unknown enum values must be carried, never rejected. Every
// union below is therefore open (`| (string & {})`).

export type PrimitiveType = "connector" | "skill" | "executor" | "asset" | (string & {});
export type AdmissionTier = "experimental" | "certified" | "official" | (string & {});
export type RiskLevel = "read" | "write" | "critical" | (string & {});
export type InteractionMode = "sync" | "async-task" | "streaming" | "subscription" | (string & {});

/** The 15-value taxonomy. Registration requires one; "other" is a real choice. */
export type Category =
  | "communication"
  | "crm"
  | "support"
  | "devops"
  | "security"
  | "finance"
  | "hr"
  | "commerce"
  | "marketing"
  | "data"
  | "documents"
  | "productivity"
  | "development"
  | "legal"
  | "other"
  | (string & {});

/** Locale map, not a resolved string: Runos does no server-side negotiation
 * because the agent knows what language the user speaks and the gateway does
 * not. Fall back to `title` when the wanted locale is absent. */
export type DisplayName = Record<string, string>;

export interface OperationSummary {
  operation: string;
  display_name?: DisplayName;
  description: string;
  interaction_mode: InteractionMode;
  risk_level: RiskLevel;
}

export interface DiscoveredCapability {
  capability_id: string;
  title: string;
  summary: string;
  use_when: string;
  avoid_when: string;
  primitive_type: PrimitiveType;
  provider: string;
  admission_tier: AdmissionTier;
  category?: Category;
  tags?: string[];
  display_name?: DisplayName;
  operations: OperationSummary[];
  availability?: Record<string, unknown>;
}

export interface DiscoverArgs {
  query: string;
  /** Default 100 upstream, hard ceiling 500. */
  limit?: number;
  category?: Category;
  /** All tags must match (AND). */
  tags?: string[];
}

/** "stable" (default) or "latest" or a bare semver. Never a "pinned:" prefix -
 * that is registry-internal vocabulary and is not accepted on the wire. */
export type VersionRef = "stable" | "latest" | (string & {});

export interface OperationContract {
  operation: string;
  displayName?: DisplayName;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  interactionMode: InteractionMode;
  riskLevel: RiskLevel;
  idempotent: boolean;
}

export interface ResolvedCapability {
  capability_id: string;
  title: string;
  primitive_type: PrimitiveType;
  display_name?: DisplayName;
  provider: string;
  version: string;
  state: string;
  contract: {
    summary: string;
    useWhen: string;
    avoidWhen: string;
    operations: OperationContract[];
    executor?: Record<string, unknown>;
    skill?: Record<string, unknown>;
    dependencies?: unknown;
    credentialRequirements?: unknown;
  };
}

export interface InvokeArgs {
  capability_id: string;
  /** Must be declared in the contract. Skills and assets accept only "fetch". */
  operation: string;
  /** Validated against the operation's inputSchema before anything leaves. */
  arguments: Record<string, unknown>;
  version?: VersionRef;
}

/**
 * "distributed" means Runos handed over CONTENT and executed nothing: the agent
 * loads and runs it in its own runtime (ADR-006). An absent field means
 * "executed" - the call really happened upstream.
 */
export type ResultKind = "distributed" | "executed" | (string & {});

export interface InvokeResult {
  /** MCP content blocks. For a skill, block 0 is the full SKILL.md. */
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  /** Structured output when the operation declares one. */
  structured?: unknown;
  meta: {
    call_id?: string;
    version_resolved?: string;
    result_kind?: ResultKind;
    content_digest?: string;
    [k: string]: unknown;
  };
}

export type TaskOutcome = "success" | "failure" | "partial";

export interface ReportOutcomeArgs {
  task_id: string;
  outcome: TaskOutcome;
  capabilities_used?: string[];
  /** Truncated upstream at 500 characters. */
  note?: string;
}

/**
 * Per-call context carried in `_meta.vxture`. task_id is MANDATORY on every
 * tool call and must stay constant for the whole task, because it is what ties
 * a task's audit rows together; a missing or over-long one is `missing_metadata`.
 */
export interface CallMeta {
  task_id: string;
  agent_version?: string;
  /** Object-level authorization credential. Runos forwards it and never
   * adjudicates on it - object-level decisions belong to the calling agent. */
  delegation_token?: string;
  session_id?: string;
  /** Set when following a skill that was already fetched. Attribution only:
   * it never widens authorization. */
  skill_context?: { skill_capability_id: string; skill_call_id?: string };
}

export const TASK_ID_MAX_LENGTH = 128;
