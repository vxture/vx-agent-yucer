-- 0104_author_may_delete_own_evidence.sql - an author may delete what they wrote.
--
-- ADR-037 (owner ruling, 2026-10-02) amends ADR-006: the evidence tables were
-- deliberately given no DELETE, so a mistaken follow-up or promise could never
-- be taken back. The service role now holds DELETE on `interaction` and
-- `commitment`; WHICH rows it may delete is the rule layer's job, not a grant's:
--
--   - only the row's author (interaction.actor_sub / commitment.created_by_sub),
--   - an interaction only while nothing relies on it (a correction, a promise it
--     originated, a promise closed on it, a deal's evidence, a rival's basis),
--   - a commitment only while it is still open.
--
-- WHY A NEW COLUMN. A commitment had no author: owner_sub is who OWES it, not
-- who recorded it. Rows written before this increment keep NULL, and a NULL
-- author is nobody - those stay, as they always did.
--
-- interaction_participant is NOT granted: its rows go with their interaction
-- (ON DELETE CASCADE), and nothing may remove a participant on its own.
--
-- Idempotent.

ALTER TABLE yucer_field.commitment
  ADD COLUMN IF NOT EXISTS created_by_sub VARCHAR(128);   -- [ref] who recorded it

GRANT DELETE ON yucer_field.interaction TO yucer_svc;
GRANT DELETE ON yucer_field.commitment  TO yucer_svc;
