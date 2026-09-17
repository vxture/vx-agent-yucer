-- 0072_customer_nature.sql - 客户分类's fourth vocabulary.
--
-- Authority: owner, 2026-09-16 - what KIND of organisation a customer is:
-- government / SOE / private / foreign. Distinct from customer_type (incr/0071,
-- HOW we sell to it - direct/channel/agent) and industry (WHAT it does) -
-- three different questions about the same account, none derivable from
-- either of the others. Same shape again: anchor code, display name, order,
-- nullable join.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_core.customer_nature (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL,
  customer_nature_code VARCHAR(32) NOT NULL,
  name                 VARCHAR(64) NOT NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_customer_nature_code UNIQUE (workspace_id, customer_nature_code)
);

CREATE INDEX IF NOT EXISTS idx_customer_nature_ws_sort
  ON yucer_core.customer_nature (workspace_id, sort_order);

-- Eight, covering the owner's own list (政府机构/事业单位/央企/国企/私企/外资)
-- plus 合资企业 (neither purely domestic nor purely foreign - a real third
-- state, not a gap between the other two) and 其他 (every other vocabulary
-- here ends with one - a customer whose nature is simply unlisted is not the
-- same fact as one nobody has classified yet).
INSERT INTO yucer_core.customer_nature (workspace_id, customer_nature_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_core.account) w
 CROSS JOIN (VALUES
   ('government',      '政府机构', 1),
   ('institution',      '事业单位', 2),
   ('central_soe',      '央企',    3),
   ('local_soe',        '国企',    4),
   ('private',          '民营企业', 5),
   ('foreign',          '外资企业', 6),
   ('joint_venture',    '合资企业', 7),
   ('other',            '其他',    8)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_core.customer_nature n WHERE n.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, customer_nature_code) DO NOTHING;

ALTER TABLE yucer_core.account
  ADD COLUMN IF NOT EXISTS customer_nature_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_account_customer_nature') THEN
    ALTER TABLE yucer_core.account
      ADD CONSTRAINT fk_account_customer_nature FOREIGN KEY (customer_nature_id)
      REFERENCES yucer_core.customer_nature (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_ws_customer_nature
  ON yucer_core.account (workspace_id, customer_nature_id);

-- --- grants -----------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON yucer_core.customer_nature TO yucer_svc;
GRANT UPDATE (name, sort_order, updated_at)
  ON yucer_core.customer_nature TO yucer_svc;

-- account: restated whole again, the fourth join added to 0071's list.
REVOKE UPDATE ON yucer_core.account FROM yucer_svc;
GRANT UPDATE (name, industry_id, customer_type_id, customer_size_id, customer_nature_id,
              region, province, segment_code, owner_sub, health_score, status,
              tier, credit_code, website, employee_count, parent_id, updated_at, deleted_at)
  ON yucer_core.account TO yucer_svc;
