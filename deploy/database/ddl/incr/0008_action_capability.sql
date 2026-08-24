-- 0008_action_capability.sql - which capability proposed this (ADR-015).
--
-- WHY: CopilotTask names the SHAPE of the work (chat / propose / score /
-- summarize), not the expertise. A delivery-risk warning and a discount
-- approval are both `propose` today - same model, same tools - and once
-- written they are indistinguishable. That makes three things impossible:
-- saying what the decision queue is actually waiting on, measuring accuracy per
-- capability, and muting one noisy capability without silencing the rest.
--
-- NOT an agent id. Atlas's applicationId is already the agent instance and the
-- metering grouping axis; seven identities would split one task's spend across
-- seven ledgers, and would cut the shared knowledge that ADR-007 introduced
-- karda to provide. See ADR-015 for the full argument.
--
-- Idempotent throughout.

-- Nullable on purpose. Historical proposals do not have one, and backfilling a
-- guess would manufacture accuracy data that reads as measured - which is worse
-- than a gap, because the gap is visible and the guess is not.
ALTER TABLE yucer_agent.agent_action
  ADD COLUMN IF NOT EXISTS capability VARCHAR(64);

-- Per-capability rollups scan by it.
CREATE INDEX IF NOT EXISTS agent_action_by_capability
  ON yucer_agent.agent_action (workspace_id, capability, status);

-- NO GRANT UPDATE. capability joins payload / rationale / confidence in the
-- frozen set: an audit has to answer "which capability proposed this AT THE
-- TIME", and a key that can be rewritten afterwards makes "how accurate is this
-- capability" permanently unanswerable - which is the main reason the column
-- exists. 98_column_locks.sql already REVOKEd UPDATE on this table and granted
-- back a named list; capability is deliberately absent from that list, so
-- nothing further is granted here.
