// Typed mirror of deploy/database/ddl/98_column_locks.sql.
//
// The database revokes table-level UPDATE and grants it back column by column.
// That is the backstop, and it works - but it fails at the driver, as
// `permission denied for column ...`, a long way from the code that built the
// patch, usually in production, and only on the code path that happens to write
// that column.
//
// This module moves the same rule to where the patch is built. column-locks.test.ts
// parses the DDL and asserts parity in both directions, so the mirror cannot
// drift: adding a writable column to the DDL without adding it here (or the
// reverse) fails CI.
//
// The three categories from the DDL are preserved exactly:
//   - mutable entities: INSERT plus a whitelist of UPDATE-able columns
//   - append-only: no UPDATE grant at all; a correction is a new row
//   - semi-immutable: the facts are frozen, only the conclusions are writable

import { fail, ok, violation, type RuleResult } from "./result";

/** schema.table -> columns the service role may UPDATE. */
export const WRITABLE_COLUMNS: Record<string, readonly string[]> = {
  // --- contract schemas (inherited from the template) ---
  "vx_provision.app_instance": ["status", "env", "provisioned_at", "updated_at"],
  "vx_provision.provision_seq": ["last_seq", "updated_at"],
  "local_authz.member": ["display_name", "avatar_hash", "status", "updated_at"],
  "local_usage.raw": ["flushed"],
  "local_usage.checkpoint": ["flushed_at"],

  // --- yucer_core ---
  "yucer_core.account": [
    "name",
    "industry",
    "region",
    "segment_code",
    "owner_sub",
    "health_score", "tier",
    "status",
    "updated_at",
    "deleted_at",
  ],
  "yucer_core.contact": [
    "name",
    "title",
    "department",
    "decision_role",
    "influence",
    "status",
    "updated_at",
    "deleted_at",
  ],

  // --- yucer_gtm ---
  "yucer_gtm.strategy_plan": [
    "name",
    "period",
    "objective",
    "owner_sub",
    "status",
    "approved_at",
    "updated_at",
  ],
  "yucer_gtm.market_segment": ["name", "plan_id", "criteria", "priority", "status", "updated_at"],
  "yucer_gtm.territory": ["name", "parent_id", "owner_sub", "regions", "status", "updated_at"],
  // The scope tuple is the row identity; only the number and the state move.
  "yucer_gtm.sales_target": ["plan_id", "target_amount", "currency", "status", "updated_at"],
  "yucer_gtm.campaign": [
    "name",
    "plan_id",
    "segment_id",
    "channel",
    "budget_amount",
    "currency",
    "owner_sub",
    "starts_at",
    "ends_at",
    "status",
    "updated_at",
  ],
  "yucer_gtm.campaign_execution": [
    "title",
    "action_type",
    "assignee_sub",
    "due_at",
    "status",
    "updated_at",
  ],

  // --- yucer_pipeline ---
  // signal: evidence frozen, only the resolution is writable.
  // targeting joins the writable set (ADR-016): re-mining can reclassify WHY we
  // were looking, and a signal matched to an account after the fact moves from
  // product_domain to named_account. The evidence columns stay frozen.
  "yucer_pipeline.signal": ["account_id", "score", "status", "targeting", "updated_at"],
  // lead: signal_id / campaign_id are the attribution record.
  "yucer_pipeline.lead": [
    "company_name",
    "contact_name",
    "account_id",
    "score",
    "owner_sub",
    "status",
    "converted_opportunity_id",
    "updated_at",
  ],
  // commitment (incr/0004): the PROMISE is frozen - statement, direction,
  // due_at and its origin are what was agreed. Only the lifecycle moves, and
  // `met` additionally requires closure evidence at the database level.
  "yucer_field.commitment": [
    "status",
    "closure_evidence_kind",
    "closure_evidence_id",
    "met_at",
    "waived_by_sub",
    "waive_reason",
    "updated_at",
  ],
  // opportunity: account_id and campaign_id are anchors; planning keys move.
  "yucer_pipeline.opportunity": [
    "name",
    "plan_id",
    "territory_id",
    "owner_sub",
    "stage",
    "forecast_category",
    "amount",
    "currency",
    "probability",
    "expected_close_at",
    "closed_at",
    "status",
    "updated_at",
    "deleted_at",
  ],
  "yucer_pipeline.win_loss_review": [
    "outcome",
    "primary_reason",
    "competitor",
    "lessons",
    "reviewer_sub",
    "reviewed_at",
    "updated_at",
  ],

  // --- yucer_delivery ---
  "yucer_delivery.project": [
    "name",
    "manager_sub",
    "contract_amount",
    "currency",
    "health",
    "starts_at",
    "ends_at", "engagement_type",
    "status",
    "updated_at",
  ],
  "yucer_delivery.project_milestone": ["name", "due_at", "completed_at", "status", "updated_at"],
  "yucer_delivery.revenue_schedule": [
    "milestone_id",
    "planned_amount",
    "actual_amount",
    "currency",
    "due_at",
    "settled_at",
    "status",
    "updated_at",
  ],

  // --- yucer_agent ---
  "yucer_agent.agent_session": ["title", "status", "updated_at"],
  // agent_action: the proposal itself is frozen; only the human decision moves.
  "yucer_agent.agent_action": ["status", "decided_by_sub", "decided_at", "executed_at", "updated_at"],
  // 0020. `workspace_id` is the row's identity and is absent on purpose: a
  // different workspace is a different row, never an edit.
  "yucer_agent.agent_autonomy": ["mode", "decided_by_sub", "updated_at"],
  "yucer_agent.agent_playbook": ["name", "trigger", "content", "version", "status", "updated_at"],
  // judgement_snooze: which conclusion, whose queue and when it was first
  // deferred are the record. Only the deferral itself may move, so re-snoozing
  // cannot rewrite who deferred what.
  "yucer_agent.judgement_snooze": ["urgency_at_snooze", "snoozed_until"],
  // account_plan: account_id and period ARE the plan's identity. Re-planning the
  // same period edits this row; a different period is a new row.
  // The catalogue. product_code / solution_code are anchors: renaming what a
  // thing IS would rewrite every historical line that referenced it.
  "yucer_catalog.product": ["name", "category", "unit", "status", "updated_at"],
  "yucer_catalog.solution": ["name", "summary", "status", "updated_at"],
  "yucer_catalog.solution_item": ["quantity"],
  // incr/0010. 0007 revoked UPDATE here and granted nothing back, so the table
  // was insert-only: a price could be entered and never corrected. Prices are
  // meant to be editable; the anchors (product, currency, workspace) are not.
  "yucer_catalog.price_book_entry": ["list_price", "floor_price"],
  // opportunity_id and product_id are the line's identity - moving a line to
  // another deal or another product is a different line.
  "yucer_pipeline.opportunity_line": [
    "quantity", "unit_price", "amount", "currency", "needs_approval", "updated_at",
  ],
  "yucer_core.account_plan": [
    "target_amount", "currency",
    "contact_cadence_days", "exec_cadence_days",
    "owner_sub", "presales_sub", "delivery_sub",
    "chain_goal", "target_lines", "status", "updated_at",
  ],
};

/**
 * Tables with UPDATE revoked and never granted back. A correction here is a new
 * row, never an in-place edit.
 */
export const APPEND_ONLY_TABLES: readonly string[] = [
  "vx_provision.webhook_delivery",
  "local_authz.role",
  "local_authz.permission",
  "local_authz.member_role",
  "local_authz.role_permission",
  "yucer_core.account_relation",
  "yucer_pipeline.opportunity_stage_event",
  "yucer_pipeline.forecast_snapshot",
  "yucer_agent.agent_message",
  // incr/0012. A signature is a decision record: withdrawing an approval is a
  // superseded row, not a deleted one. Keyed by the price it authorised, so it
  // survives the replace-not-patch rewrite that editing any other line causes.
  "yucer_pipeline.line_discount_approval",
  // yucer_field, added by incr/0004. Evidence is frozen: a correction is a new
  // row carrying corrects_interaction_id, never an edit of the original.
  "yucer_field.interaction",
  "yucer_field.interaction_participant",
];

const APPEND_ONLY = new Set(APPEND_ONLY_TABLES);

/** camelCase (Prisma field) -> snake_case (DDL column). */
export function toSnakeCase(field: string): string {
  return field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function isAppendOnly(table: string): boolean {
  return APPEND_ONLY.has(table);
}

export function writableColumns(table: string): readonly string[] {
  return WRITABLE_COLUMNS[table] ?? [];
}

/**
 * WHY a particular column is frozen, in the rule layer's own words.
 *
 * These sentences arrived here on 2026-08-31 from six separate guards -
 * assertNoFrozenOpportunityKeys, assertNoFrozenLeadKeys, assertEvidenceUnchanged,
 * assertProposalUnchanged, assertSequenceUnchanged, assertScopeUnchanged - each
 * of which refused a patch touching one of these columns. Every one of those
 * columns is already absent from WRITABLE_COLUMNS, so assertWritable already
 * refused all of them; the guards were a second answer to a question this
 * module answers (ADR-023's shape), and the wired guard found them because
 * nothing but their own tests ever called them.
 *
 * They were kept for one batch rather than deleted, because they had something
 * the generic refusal does not: the REASON. "Rewriting evidence is fabricating
 * it" says more than "this column has no UPDATE grant". Deleting them outright
 * would have removed the duplication by throwing away the knowledge. This map
 * is the knowledge, moved to the one place that already does the checking.
 *
 * THE CODE DOES NOT CHANGE - it stays `column_not_writable`. A violation's
 * message is written for the rule layer's own reader and is ASCII English by
 * construction; the sentence a member sees comes from the code, through the
 * message dictionary (TD-010). Emitting six new codes would mean six new
 * dictionary entries per locale for refusals no interface is meant to render
 * differently. The reason belongs in the message, which is exactly where those
 * six guards had it.
 *
 * Keyed `schema.table.column`, snake_case, and asserted against both the mirror
 * and the DDL: a reason naming a column that is writable would never fire, and
 * one naming a column that does not exist would be a comment pretending to be
 * a rule.
 */
export const FROZEN_COLUMN_REASON: Record<string, string> = {
  // Attribution: the record of where demand came from, computed once at
  // creation from facts. Editable attribution is credit for revenue
  // reassignable after everyone can see which allocation pays better.
  "yucer_pipeline.opportunity.account_id":
    "whose deal this is was settled at creation; a different customer is a different deal",
  "yucer_pipeline.opportunity.campaign_id":
    "where this deal came from is the attribution record; correcting it is a db-init data correction, where it leaves a trace",
  "yucer_pipeline.opportunity.source_project_id":
    "which project this renews is the same kind of fact as which campaign produced it",
  "yucer_pipeline.lead.signal_id":
    "the evidence this lead came from is its lineage, not a field",
  "yucer_pipeline.lead.campaign_id":
    "the campaign this lead was inherited from is the attribution record",

  // Evidence: what was observed. Editing it is not correcting a record, it is
  // changing what the record says happened.
  "yucer_pipeline.signal.source": "evidence is frozen after creation; rewriting evidence is fabricating it",
  "yucer_pipeline.signal.source_ref": "evidence is frozen after creation; rewriting evidence is fabricating it",
  "yucer_pipeline.signal.signal_type": "evidence is frozen after creation; rewriting evidence is fabricating it",
  "yucer_pipeline.signal.subject": "evidence is frozen after creation; rewriting evidence is fabricating it",
  "yucer_pipeline.signal.payload": "evidence is frozen after creation; rewriting evidence is fabricating it",
  "yucer_pipeline.signal.detected_at": "evidence is frozen after creation; rewriting evidence is fabricating it",

  // The model's own record. ADR-003: the copilot proposes, a human decides -
  // and what it proposed has to still be readable after the decision.
  "yucer_agent.agent_action.payload":
    "this records what the model recommended at the time; a revised recommendation is a new proposal",
  "yucer_agent.agent_action.rationale":
    "this records why the model recommended it; a revised rationale is a new proposal",
  "yucer_agent.agent_action.confidence":
    "this records how sure the model was at the time; editing it rewrites the basis a person decided on",

  // Identity tuples: the row IS its key, so changing the key means a different
  // row rather than an edited one.
  "yucer_delivery.revenue_schedule.sequence":
    "sequence is part of the row identity; reordering instalments means writing new rows",
  "yucer_gtm.sales_target.period":
    "a target's scope is its identity; a different scope is a different target",
  "yucer_gtm.sales_target.scope_type":
    "a target's scope is its identity; a different scope is a different target",
  "yucer_gtm.sales_target.territory_id":
    "a target's scope is its identity; a different scope is a different target",
  "yucer_gtm.sales_target.owner_sub":
    "a target's scope is its identity; a different scope is a different target",
  "yucer_gtm.sales_target.metric":
    "a target's scope is its identity; a different scope is a different target",
};

/**
 * Assert a patch only touches columns the service role may write.
 *
 * Field names are accepted in either style: adapters build patches in Prisma's
 * camelCase, and the DDL speaks snake_case. Checking both here means a caller
 * never has to convert, and never has a reason to skip the check.
 *
 * An unknown table is an ERROR rather than a pass. A typo in a table name that
 * silently allowed every column would defeat the whole point of this module.
 */
export function assertWritable(table: string, patch: Record<string, unknown>): RuleResult<true> {
  if (isAppendOnly(table)) {
    const keys = Object.keys(patch);
    if (keys.length === 0) return ok(true);
    return fail(
      violation(
        "append_only_table",
        `${table} is append-only and has no UPDATE grant; record a correction as a new row`,
        keys[0],
      ),
    );
  }

  const allowed = WRITABLE_COLUMNS[table];
  if (!allowed) {
    return fail(
      violation("unknown_table", `${table} is not in the column-lock mirror; check the table name`, "table"),
    );
  }

  const allowedSet = new Set(allowed);
  const offending = Object.keys(patch).filter((k) => !allowedSet.has(k) && !allowedSet.has(toSnakeCase(k)));
  if (offending.length === 0) return ok(true);

  return {
    ok: false,
    violations: offending.map((k) => {
      const column = toSnakeCase(k);
      const why = FROZEN_COLUMN_REASON[`${table}.${column}`];
      return violation(
        "column_not_writable",
        why
          ? `${table}.${column} has no UPDATE grant: ${why}`
          : `${table}.${column} has no UPDATE grant; writing it fails with permission denied at the database`,
        k,
      );
    }),
  };
}

/**
 * Strip a patch down to what is actually writable, reporting what was dropped.
 *
 * For paths that legitimately receive a wide object (a form post, a copilot
 * proposal payload) and should apply the safe subset rather than fail whole.
 */
export function pickWritable(
  table: string,
  patch: Record<string, unknown>,
): { patch: Record<string, unknown>; dropped: string[] } {
  if (isAppendOnly(table)) return { patch: {}, dropped: Object.keys(patch) };
  const allowed = new Set(WRITABLE_COLUMNS[table] ?? []);
  const out: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (allowed.has(k) || allowed.has(toSnakeCase(k))) out[k] = v;
    else dropped.push(k);
  }
  return { patch: out, dropped };
}
