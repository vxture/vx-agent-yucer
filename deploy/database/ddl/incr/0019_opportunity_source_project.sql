-- 0019_opportunity_source_project.sql - the D7 -> D6 return leg.
--
-- Authority: docs/70-workplan/00-index.md (the flow plan, batch 2, "续约") and
-- the owner's ruling of 2026-08-30 - a renewal opportunity is derived FROM THE
-- PROJECT, and only for subscription projects.
--
-- WHAT WAS MISSING, and it is one direction of one edge. `project.opportunity_id`
-- has recorded the outward leg since the baseline: this delivery came from that
-- deal. Nothing recorded the return leg - THIS DEAL IS THE RENEWAL OF THAT
-- DELIVERY - and without it `assessRenewal`'s `already_renewed` branch can
-- never be reached. The rule shipped in 0018's batch with that branch written,
-- tested against a hand-passed flag, and unreachable from any real caller: the
-- product would have proposed the same renewal every time the page was opened,
-- for as long as the term stayed inside the window, no matter how many deals
-- somebody had already opened off it.
--
-- ON THE OPPORTUNITY, NOT ON THE PROJECT. Both placements would answer "has
-- this been renewed", so the tie is broken by who owns the write:
--
--   * `opportunity.source_project_id` is written by D6, when D6 creates its own
--     row. One object, one owning domain (CLAUDE.md, rigid zone).
--   * `project.renewal_opportunity_id` would need D6 to reach into D7's table
--     to record something about a deal. That is the ownership rule broken to
--     save a column, and it also caps a project at one renewal forever, which
--     is wrong for the second term of a subscription that keeps going.
--
-- It is also the shape the model already uses. "Where did this deal come from"
-- is attribution, and attribution lives on the opportunity - campaign_id and
-- account_id are already there, already frozen.
--
-- SO IT GETS NO UPDATE GRANT, and that is the point rather than an oversight.
-- 98_column_locks.sql rule 2: attribution keys captured at creation are never
-- writable. INSERT is table-wide (97_service_role.sql), so the column can be
-- written once, at creation, by the same act that resolves the attribution -
-- and never edited afterwards. Correcting a wrong lineage is a db-init data
-- correction, where it leaves a trace.
--
-- Consequently 98 needs no edit and the writable-column mirror does not move.
-- An increment must re-state the GRANT only when it adds a WRITABLE column;
-- adding a frozen one is complete on its own, and re-stating the grant list
-- here would be a second copy of it to keep in step.
--
-- ON DELETE SET NULL, matching fk_project_opportunity in the other direction.
-- A deleted project must not take a live customer-facing deal with it.
--
-- Idempotent throughout.

ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS source_project_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_opportunity_source_project'
  ) THEN
    ALTER TABLE yucer_pipeline.opportunity
      ADD CONSTRAINT fk_opportunity_source_project
      FOREIGN KEY (source_project_id)
      REFERENCES yucer_delivery.project (id) ON DELETE SET NULL;
  END IF;
END $$;

-- The renewal page's one question is "which projects already have a deal open
-- off them", asked once per page load over the whole workspace. Without this
-- it is a sequential scan of every opportunity ever created.
CREATE INDEX IF NOT EXISTS idx_opportunity_ws_source_project
  ON yucer_pipeline.opportunity (workspace_id, source_project_id)
  WHERE source_project_id IS NOT NULL;
