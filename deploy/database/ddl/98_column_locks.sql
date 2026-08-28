-- Column-level UPDATE whitelist (governance section 7). REVOKE table UPDATE, then
-- GRANT only the writable columns. Anchor columns (id, *_id reference keys,
-- created_at) are never writable. Append-only / link tables get no UPDATE at all.
-- Adding a writable column requires updating this whitelist, or the service write
-- fails with permission denied.

-- --- vx_provision ---
REVOKE UPDATE ON vx_provision.app_instance FROM yucer_svc;
GRANT UPDATE (status, env, provisioned_at, updated_at)
  ON vx_provision.app_instance TO yucer_svc;

-- webhook_delivery: append-only idempotency ledger -> no UPDATE.
REVOKE UPDATE ON vx_provision.webhook_delivery FROM yucer_svc;

REVOKE UPDATE ON vx_provision.provision_seq FROM yucer_svc;
GRANT UPDATE (last_seq, updated_at)
  ON vx_provision.provision_seq TO yucer_svc;

-- --- local_authz ---
REVOKE UPDATE ON local_authz.member FROM yucer_svc;
GRANT UPDATE (display_name, avatar_hash, status, updated_at)
  ON local_authz.member TO yucer_svc;

-- role / permission catalogs are seeded via db-init, not mutated at runtime.
REVOKE UPDATE ON local_authz.role FROM yucer_svc;
REVOKE UPDATE ON local_authz.permission FROM yucer_svc;

-- link tables: insert/delete only.
REVOKE UPDATE ON local_authz.member_role FROM yucer_svc;
REVOKE UPDATE ON local_authz.role_permission FROM yucer_svc;

-- --- local_usage ---
-- raw: the flush job flips `flushed`; nothing else is mutable.
REVOKE UPDATE ON local_usage.raw FROM yucer_svc;
GRANT UPDATE (flushed) ON local_usage.raw TO yucer_svc;

REVOKE UPDATE ON local_usage.checkpoint FROM yucer_svc;
GRANT UPDATE (flushed_at) ON local_usage.checkpoint TO yucer_svc;

-- ###########################################################################
-- PRODUCT DOMAIN COLUMN LOCKS (yucer)
--
-- Three rules decide whether a domain column appears below:
--   1. Anchors are never writable: id, workspace_id, *_no / *_code business
--      numbers, created_at.
--   2. ATTRIBUTION keys captured at creation are never writable - they are the
--      record of where demand came from: lead.signal_id, lead.campaign_id,
--      opportunity.campaign_id, opportunity.account_id, and every evidence
--      column on signal (source, source_ref, signal_type, subject, payload,
--      detected_at). PLANNING keys that reflect current ownership
--      (opportunity.plan_id / territory_id / owner_sub) stay writable.
--   3. Append-only tables get no UPDATE at all: account_relation,
--      opportunity_stage_event, forecast_snapshot, agent_message. A correction
--      is a new row, never an in-place edit.
--
-- Adding a writable domain column requires adding it here, or the service write
-- fails with permission denied.
-- ###########################################################################

-- --- yucer_core ---
REVOKE UPDATE ON yucer_core.account FROM yucer_svc;
GRANT UPDATE (name, industry, region, segment_code, owner_sub, health_score, status, updated_at, deleted_at)
  ON yucer_core.account TO yucer_svc;

REVOKE UPDATE ON yucer_core.contact FROM yucer_svc;
GRANT UPDATE (name, title, department, decision_role, influence, status, updated_at, deleted_at)
  ON yucer_core.contact TO yucer_svc;

-- account_relation: append-only graph edge -> no UPDATE.
REVOKE UPDATE ON yucer_core.account_relation FROM yucer_svc;

REVOKE UPDATE ON yucer_core.offering FROM yucer_svc;
GRANT UPDATE (name, category, list_price, currency, status, updated_at)
  ON yucer_core.offering TO yucer_svc;

-- --- yucer_gtm ---
REVOKE UPDATE ON yucer_gtm.strategy_plan FROM yucer_svc;
GRANT UPDATE (name, period, objective, owner_sub, status, approved_at, updated_at)
  ON yucer_gtm.strategy_plan TO yucer_svc;

REVOKE UPDATE ON yucer_gtm.market_segment FROM yucer_svc;
GRANT UPDATE (name, plan_id, criteria, priority, status, updated_at)
  ON yucer_gtm.market_segment TO yucer_svc;

REVOKE UPDATE ON yucer_gtm.territory FROM yucer_svc;
GRANT UPDATE (name, parent_id, owner_sub, status, updated_at)
  ON yucer_gtm.territory TO yucer_svc;

-- sales_target: the scope tuple (period, scope_type, territory_id, owner_sub,
-- metric) is the row identity -> immutable; only the number and state move.
REVOKE UPDATE ON yucer_gtm.sales_target FROM yucer_svc;
GRANT UPDATE (plan_id, target_amount, currency, status, updated_at)
  ON yucer_gtm.sales_target TO yucer_svc;

REVOKE UPDATE ON yucer_gtm.campaign FROM yucer_svc;
GRANT UPDATE (name, plan_id, segment_id, channel, budget_amount, currency, owner_sub,
              starts_at, ends_at, status, updated_at)
  ON yucer_gtm.campaign TO yucer_svc;

REVOKE UPDATE ON yucer_gtm.campaign_execution FROM yucer_svc;
GRANT UPDATE (title, action_type, assignee_sub, due_at, status, updated_at)
  ON yucer_gtm.campaign_execution TO yucer_svc;

-- --- yucer_pipeline ---
-- signal: evidence is immutable. Only the resolution (matched account, score,
-- lifecycle status) is writable.
REVOKE UPDATE ON yucer_pipeline.signal FROM yucer_svc;
GRANT UPDATE (account_id, score, status, updated_at)
  ON yucer_pipeline.signal TO yucer_svc;

-- lead: signal_id / campaign_id are the attribution record -> immutable.
REVOKE UPDATE ON yucer_pipeline.lead FROM yucer_svc;
GRANT UPDATE (company_name, contact_name, account_id, score, owner_sub, status,
              converted_opportunity_id, updated_at)
  ON yucer_pipeline.lead TO yucer_svc;

-- opportunity: account_id and campaign_id are anchors (whose deal, where it came
-- from); planning keys and the whole commercial state are writable.
REVOKE UPDATE ON yucer_pipeline.opportunity FROM yucer_svc;
GRANT UPDATE (name, plan_id, territory_id, owner_sub, stage, forecast_category,
              amount, currency, probability, expected_close_at, closed_at, status,
              updated_at, deleted_at)
  ON yucer_pipeline.opportunity TO yucer_svc;

-- opportunity_stage_event / forecast_snapshot: append-only journals -> no UPDATE.
REVOKE UPDATE ON yucer_pipeline.opportunity_stage_event FROM yucer_svc;
REVOKE UPDATE ON yucer_pipeline.forecast_snapshot FROM yucer_svc;

REVOKE UPDATE ON yucer_pipeline.win_loss_review FROM yucer_svc;
GRANT UPDATE (outcome, primary_reason, competitor, lessons, reviewer_sub, reviewed_at, updated_at)
  ON yucer_pipeline.win_loss_review TO yucer_svc;

-- --- yucer_delivery ---
REVOKE UPDATE ON yucer_delivery.project FROM yucer_svc;
GRANT UPDATE (name, manager_sub, contract_amount, currency, health, starts_at, ends_at,
              status, updated_at)
  ON yucer_delivery.project TO yucer_svc;

-- project_milestone.sequence is part of uidx_project_milestone_seq -> immutable.
REVOKE UPDATE ON yucer_delivery.project_milestone FROM yucer_svc;
GRANT UPDATE (name, due_at, completed_at, status, updated_at)
  ON yucer_delivery.project_milestone TO yucer_svc;

-- revenue_schedule.sequence is part of uidx_revenue_schedule_seq -> immutable.
REVOKE UPDATE ON yucer_delivery.revenue_schedule FROM yucer_svc;
GRANT UPDATE (milestone_id, planned_amount, actual_amount, currency, due_at, settled_at,
              status, updated_at)
  ON yucer_delivery.revenue_schedule TO yucer_svc;

-- --- yucer_agent ---
REVOKE UPDATE ON yucer_agent.agent_session FROM yucer_svc;
GRANT UPDATE (title, status, updated_at)
  ON yucer_agent.agent_session TO yucer_svc;

-- agent_message: append-only transcript -> no UPDATE.
REVOKE UPDATE ON yucer_agent.agent_message FROM yucer_svc;

-- agent_action: the proposal itself (payload, rationale, confidence) is the
-- model's record and is immutable; only the human decision and execution move.
REVOKE UPDATE ON yucer_agent.agent_action FROM yucer_svc;
GRANT UPDATE (status, decided_by_sub, decided_at, executed_at, updated_at)
  ON yucer_agent.agent_action TO yucer_svc;

REVOKE UPDATE ON yucer_agent.agent_playbook FROM yucer_svc;
GRANT UPDATE (name, trigger, content, version, status, updated_at)
  ON yucer_agent.agent_playbook TO yucer_svc;

-- yucer_field (interaction, interaction_participant, commitment) is NOT locked
-- here. Its locks live in incr/0004_field_evidence.sql alongside the CREATE
-- TABLE, because db-init applies 97 and 98 BEFORE incr/*, so a lock written in
-- this file would run against tables that do not exist yet.
--
-- The rule for any future increment that creates a table: carry its own grants
-- and its own locks. check-incr-grants.mjs enforces the grants half.
