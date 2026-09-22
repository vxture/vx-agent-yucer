-- 0075_opportunity_contact_stance.sql - a buying influence's stance toward us
-- is a separate fact from their functional role in the purchase.
--
-- Authority: owner, 2026-09-21 - 决策链框架补充: 组织内角色分类(EB/UB/TB/
-- Coach)、对我方的立场态度(拥护者/支持者/中立者/反对者)、实际影响力权重、
-- 人际及利益博弈关系, 四个独立维度。
--
-- buying_role (incr/0027) ALREADY IS EB/UB/TB/Coach - economic/user/technical/
-- coach, just without the English initials in its display label. That part of
-- the framework needed no schema change, only relabelling (UI-side).
--
-- STANCE IS THE PART buying_role CANNOT ANSWER. "他手握技术一票否决权"
-- (buying_role=technical) and "他处处刁难我方" (stance=antagonist) are two
-- different facts about the same person, and the same TB can be a champion on
-- one deal and an antagonist on the next - exactly the per-deal reasoning
-- ADR-024 already established for buying_role itself, applied to a second
-- question about the same row.
--
-- WHY NOT REUSE 'blocker'. The old 'blocker' value tried to answer both "what
-- is this person's function" and "are they against us" with one enumerated
-- value - the same one-column-two-questions shape ADR-024 criticised in
-- person.decision_role. 'blocker' stays a legal buying_role for backward
-- compatibility (existing rows, and analyzeChain's own tested
-- opponent-avoidance walk, which keys on it) but is no longer offered as a
-- choice in the form that writes new rows - a new row states a real function
-- (EB/UB/TB/Coach) and, separately, a stance.
--
-- NULLABLE, NO BACKFILL - same reasoning as 0027's own "NO BACKFILL either":
-- nobody has ever stated a stance, so there is nothing to carry forward, and
-- guessing one from buying_role would be exactly the kind of invented fact
-- this product's own guardrails refuse elsewhere (org-unit-panel.tsx's "a
-- dossier card states facts, it does not carry a guess"). The demo seed states
-- real stances deal by deal, same as it does for buying_role.
--
-- Idempotent throughout.

ALTER TABLE yucer_pipeline.opportunity_contact
  ADD COLUMN IF NOT EXISTS stance VARCHAR(16);

ALTER TABLE yucer_pipeline.opportunity_contact
  DROP CONSTRAINT IF EXISTS chk_opportunity_contact_stance;
ALTER TABLE yucer_pipeline.opportunity_contact
  ADD CONSTRAINT chk_opportunity_contact_stance
  CHECK (stance IS NULL OR stance IN ('champion', 'supporter', 'neutral', 'antagonist'));

-- --- grants -------------------------------------------------------------
-- Whole list restated (house rule since 0068's postmortem): stance is the
-- only addition to 0027's original writable set.
REVOKE UPDATE ON yucer_pipeline.opportunity_contact FROM yucer_svc;
GRANT UPDATE (buying_role, influence, is_primary, stance, updated_at)
  ON yucer_pipeline.opportunity_contact TO yucer_svc;
