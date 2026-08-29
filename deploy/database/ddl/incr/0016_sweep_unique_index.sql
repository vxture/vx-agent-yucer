-- 0016_sweep_unique_index.sql - the sweep's race window gets a database floor
-- (TD-003).
--
-- Authority: docs/60-operations/00-index.md TD-003. This file and that entry
-- must be changed together.
--
-- WHY. runCommitmentSweep dedups read-then-write with no lock: two sweeps
-- running at once both read an empty pending set and both file, every proposal
-- appears twice, and BOTH ledgers report a clean run - the only defect in the
-- 2026-08-17 self-audit where neither side reports an error. agent_action
-- carried only non-unique indexes, so nothing below the application could
-- catch it.
--
-- THE WHERE CLAUSE IS LOAD-BEARING. A full unique index would permanently
-- block re-proposing a commitment after a human rejects the first proposal -
-- and re-asking about a still-broken promise is exactly what the sweep is for.
-- Scoped to status='proposed', the constraint holds only while a proposal is
-- waiting for a decision; once decided, the same commitment may be raised
-- again.
--
-- NULL commitmentIds are deliberately unconstrained: only the sweep writes
-- that key. Other proposal kinds (copilot turns, judgement sweeps) carry no
-- commitmentId, their expression is NULL, and Postgres unique indexes treat
-- NULLs as distinct - so this floor constrains the one writer that needs it
-- and nothing else.
--
-- The application keeps its read-then-write dedup as the FAST path; this index
-- is the floor under the race, and the store maps the violation to "already
-- queued" rather than to an error, because a duplicate proposal arriving
-- second is not a fault - it is the race being won by the other writer.
--
-- Idempotent: re-applying is a no-op.

CREATE UNIQUE INDEX IF NOT EXISTS uidx_agent_action_sweep_open
  ON yucer_agent.agent_action (workspace_id, action_type, (payload->>'commitmentId'))
  WHERE action_type = 'chase_overdue_commitment' AND status = 'proposed';
