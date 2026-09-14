-- 0063_opportunity_config_permission.sql - one write permission for the whole
-- /admin/opportunity page, replacing six.
--
-- Authority for the contents: docs/20-specs/50-role-permission-catalog.md. This
-- file and that document must be changed together.
--
-- WHAT IT REPLACES. The six sections on /admin/opportunity (商机类型/商机
--阶段/赢丢原因/预测阈值/账龄分档/计价货币) each checked a different write
-- permission (pipeline.dealType / pipeline.stage / pipeline.write /
-- pipeline.forecast / delivery.write / catalog.price), inherited one at a
-- time as each section was its own standalone route before the PR4 assembly
-- batch. A page that is entirely "set up how deals move through this
-- workspace" being gated by six unrelated permission checks was never a
-- decision anyone made on purpose - it was six pages' worth of history
-- surviving one merge.
--
-- OWNER PRINCIPLE (2026-09-13): admin configuration should be simple and
-- open; the tier/permission complexity belongs on the real BUSINESS pages
-- that use these settings (/forecast, /winloss, /collection), not on the
-- page that only configures them. Configuring a capability a workspace
-- has not bought yet is allowed here; USING it still is not - those three
-- pages' own gates are untouched by this increment.
--
-- GRANTED AS THE UNION of the six permissions' current holders - nobody's
-- write access on this page narrows. The SERVICE-layer verbs this page's
-- six save actions call (upsertDealType, upsertStageDefinition,
-- upsertWinLossReason/moveWinLossReason/removeWinLossReason,
-- setForecastThresholds, setDealTypeStallOverride, setPricingPolicy,
-- setAgeingCutoffs) are each exclusively used by this one page - confirmed
-- by reading every caller - so switching their own gate to this one
-- permission cannot affect any other page. The six OLD permissions are NOT
-- retired: pipeline.write/pipeline.forecast/delivery.write/catalog.price
-- still gate their own, different actions elsewhere (recordWinLossReview on
-- /winloss, applySuggestedCategory on /forecast and /pipeline/[id], the real
-- price book, delivery.project.upsert/milestone.upsert, lead conversion,
-- opportunity create/update/advance) - only THIS page's own six verbs moved
-- off them.
--
-- READ side needs no new permission at all: it reuses the page's own
-- existing pipeline.opportunityconfig.view (incr from the PR4 batch), which
-- already resolves to pipeline.read with no feature key. The three sections
-- that used to carry an ADDITIONAL paid-tier gate on top of that
-- (pipeline.forecast / pipeline.winloss / delivery.revenue) have that gate
-- dropped in the accompanying service.ts/actions.ts changes, not in this
-- DDL - there was no permission ROW to remove, only a stricter check to
-- relax in code.
--
-- Idempotent: re-applying is a no-op.

-- --- The permission ----------------------------------------------------------

INSERT INTO local_authz.permission (perm_code, name) VALUES
  ('pipeline.opportunityConfig', 'Configure any of the six /admin/opportunity sections')
ON CONFLICT (perm_code) DO NOTHING;

-- --- The grants: the union of pipeline.dealType / pipeline.stage /
-- pipeline.write / pipeline.forecast / delivery.write / catalog.price's
-- current holders (23 of 31 roles) ------------------------------------------

INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('sales_leader',             'pipeline.opportunityConfig'),
  ('sales_rep',                'pipeline.opportunityConfig'),
  ('sales_manager',            'pipeline.opportunityConfig'),
  ('regional_director',        'pipeline.opportunityConfig'),
  ('senior_sales_manager',     'pipeline.opportunityConfig'),
  ('regional_general_manager', 'pipeline.opportunityConfig'),
  ('channel_manager',          'pipeline.opportunityConfig'),
  ('senior_channel_manager',   'pipeline.opportunityConfig'),
  ('key_account_manager',      'pipeline.opportunityConfig'),
  ('sales_director',           'pipeline.opportunityConfig'),
  ('branch_general_manager',   'pipeline.opportunityConfig'),
  ('channel_head',             'pipeline.opportunityConfig'),
  ('sales_ops',                'pipeline.opportunityConfig'),
  ('sales_ops_specialist',     'pipeline.opportunityConfig'),
  ('marketing_head',           'pipeline.opportunityConfig'),
  ('ops_head',                 'pipeline.opportunityConfig'),
  ('finance',                  'pipeline.opportunityConfig'),
  ('deal_desk',                'pipeline.opportunityConfig'),
  ('presales_head',            'pipeline.opportunityConfig'),
  ('delivery_manager',         'pipeline.opportunityConfig'),
  ('senior_delivery_manager',  'pipeline.opportunityConfig'),
  ('customer_success',         'pipeline.opportunityConfig'),
  ('delivery_head',            'pipeline.opportunityConfig')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
