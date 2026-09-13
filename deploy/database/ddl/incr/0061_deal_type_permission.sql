-- 0061_deal_type_permission.sql - somebody has to be able to configure the
-- classification axis incr/0060 just built.
--
-- Authority for the contents: docs/20-specs/50-role-permission-catalog.md. This
-- file and that document must be changed together.
--
-- WHY A DEDICATED CODE rather than reusing pipeline.write, even though this
-- vocabulary is lighter-weight than 商机阶段's: added the same way incr/0059
-- added pipeline.stage, for consistency across the batch's two new
-- vocabularies. pipeline.dealType.view resolves to the existing pipeline.read
-- - reading the type catalog is not a new authority, any more than reading the
-- deals on it is.
--
-- GRANTED MORE BROADLY than pipeline.stage was, deliberately: redefining the
-- stage catalog rewrites what "won" means for every rep's pipeline, which is
-- why that one stayed restricted to management tiers. Classifying a deal's
-- TYPE (新签/续费/增购/项目型/产品型) is closer to owning the deal itself -
-- the same rep who prices a deal and advances its stage is the natural person
-- to say what kind of deal it is. Granted to the same twelve roles that
-- already hold pipeline.write.
--
-- Idempotent: re-applying is a no-op.

-- --- The permission (catalog grows 26 -> 27) --------------------------------

INSERT INTO local_authz.permission (perm_code, name) VALUES
  ('pipeline.dealType', 'Rename, reorder or add/remove an entry in the deal type catalog')
ON CONFLICT (perm_code) DO NOTHING;

-- --- The grants (411 -> 423) -------------------------------------------------

INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('sales_leader',             'pipeline.dealType'),
  ('sales_rep',                'pipeline.dealType'),
  ('sales_manager',            'pipeline.dealType'),
  ('regional_director',        'pipeline.dealType'),
  ('senior_sales_manager',     'pipeline.dealType'),
  ('regional_general_manager', 'pipeline.dealType'),
  ('channel_manager',          'pipeline.dealType'),
  ('senior_channel_manager',   'pipeline.dealType'),
  ('key_account_manager',      'pipeline.dealType'),
  ('sales_director',           'pipeline.dealType'),
  ('branch_general_manager',   'pipeline.dealType'),
  ('channel_head',             'pipeline.dealType')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
