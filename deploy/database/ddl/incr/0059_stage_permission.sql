-- 0059_stage_permission.sql - editing the stage catalog is not "owning a deal".
--
-- Authority for the contents: docs/20-specs/50-role-permission-catalog.md. This
-- file and that document must be changed together.
--
-- WHY: incr/0057/0058 made 商机阶段 a per-workspace catalog a tenant can
-- rename, reorder, re-price and extend - previously a hardcoded seven-value
-- union nobody could touch. Advancing a single deal through the existing
-- stages stays `pipeline.write` (sales_rep already holds it, unchanged).
-- REDEFINING THE STAGES THEMSELVES - what "won" even means, what order the
-- funnel counts in, whether a stage's default win rate is 10% or 30% - is a
-- workspace-wide policy decision with the same shape as the split
-- `pipeline.write`/`pipeline.forecast` already draws one level up ("owns the
-- deal, not the forecast commitment"): a rep who owns their own pipeline must
-- not be able to redefine what "won" means for every other rep's pipeline too.
--
-- pipeline.stage.view (read-only: what does the catalog look like right now)
-- resolves to the existing pipeline.read - viewing the stage list is not a
-- new authority, any more than viewing the deals on it is.
--
-- Idempotent: re-applying is a no-op.

-- --- The permission (catalog grows 25 -> 26) --------------------------------

INSERT INTO local_authz.permission (perm_code, name) VALUES
  ('pipeline.stage', 'Rename, reorder, re-price or add/remove a stage in the pipeline stage catalog')
ON CONFLICT (perm_code) DO NOTHING;

-- --- The grants (397 -> 411) -------------------------------------------------
--
-- The same roles that already hold pipeline.forecast - the existing line for
-- "pipeline authority beyond a single rep's own deals" (forecast
-- categorization commits a number upward; redefining the stage catalog
-- commits the whole team's funnel to a new shape). NOT sales_rep, presales, or
-- delivery_manager: none of them commits a number upward today either.

INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('sales_leader',           'pipeline.stage'),
  ('sales_ops',              'pipeline.stage'),
  ('sales_manager',          'pipeline.stage'),
  ('regional_director',      'pipeline.stage'),
  ('senior_sales_manager',   'pipeline.stage'),
  ('regional_general_manager', 'pipeline.stage'),
  ('senior_channel_manager', 'pipeline.stage'),
  ('sales_ops_specialist',   'pipeline.stage'),
  ('key_account_manager',    'pipeline.stage'),
  ('sales_director',         'pipeline.stage'),
  ('branch_general_manager', 'pipeline.stage'),
  ('channel_head',           'pipeline.stage'),
  ('marketing_head',         'pipeline.stage'),
  ('ops_head',               'pipeline.stage')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
