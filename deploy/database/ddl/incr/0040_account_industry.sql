-- 0040_account_industry.sql - 行业 becomes a vocabulary, like every other one.
--
-- Authority: owner, 2026-09-08 - the pass over what this product still keeps
-- as hard-coded or free-text data, taken in batches.
--
-- WHAT IT WAS: `account.industry VARCHAR(64)`, free text with no CHECK, no
-- list and no default. The interface offered whatever the workspace had
-- already typed (domains/shared/suggest.ts knownValues), which is a habit
-- rather than a vocabulary: "制造" on one record and "制造业" on the next are
-- two industries to every group-by in the product, and a market segment whose
-- criteria name one of them silently stops matching the other.
--
-- IT MATTERS MORE THAN A LABEL. The industry decides the market segment, the
-- segment decides the playbook, and the copilot will happily propose an
-- industry for a customer that has none (ask-complete-action says so in its
-- own warning). A guessed value outside the workspace's list is now refused
-- instead of quietly becoming a new industry.
--
-- SAME SHAPE AS 0028 / 0029 / 0037 / 0039: an anchor code, a display name, an
-- order, a per-workspace unique index, and a uuid join from the row that uses
-- it. NULLABLE join, unlike product.unit_id: most customers arrive as a name
-- and a phone number, and an industry nobody has established yet is honestly
-- absent rather than defaulted to 其他.
--
-- Idempotent throughout.

-- --- the industry vocabulary ------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_core.industry (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  industry_code VARCHAR(32) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(64) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_industry_code UNIQUE (workspace_id, industry_code)
);

CREATE INDEX IF NOT EXISTS idx_industry_ws_sort
  ON yucer_core.industry (workspace_id, sort_order);

-- The shipped starter set, per workspace that already has customers. Guarded
-- on a COMPLETELY EMPTY vocabulary so a tenant's deletions do not resurrect on
-- a re-run - the same guard 0029, 0037 and 0039 use.
--
-- THIRTEEN, not the 20 categories of 国民经济行业分类 and not five. It is the
-- coarse cut a B2B seller actually segments on, and a list too fine to choose
-- from quickly gets one value picked for everything.
INSERT INTO yucer_core.industry (workspace_id, industry_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_core.account) w
 CROSS JOIN (VALUES
   ('manufacturing', '制造',     1),
   ('it',            '信息技术',  2),
   ('telecom',       '通信',     3),
   ('finance',       '金融',     4),
   ('retail',        '零售',     5),
   ('logistics',     '物流',     6),
   ('healthcare',    '医药健康',  7),
   ('energy',        '能源',     8),
   ('construction',  '建筑地产',  9),
   ('education',     '教育',    10),
   ('government',    '政府公共', 11),
   ('services',      '专业服务', 12),
   ('other',         '其他',    13)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_core.industry i WHERE i.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, industry_code) DO NOTHING;

-- Whatever a workspace actually typed, kept - but only where the shipped list
-- does not already say it. The old column held DISPLAY text, so a workspace
-- that typed 制造 means the row seeded above; adding a second row whose code
-- is the characters 制造 would split the same industry in two, which is the
-- defect this increment exists to end.
INSERT INTO yucer_core.industry (workspace_id, industry_code, name, sort_order)
SELECT DISTINCT a.workspace_id, a.industry, a.industry, 99
  FROM yucer_core.account a
 WHERE a.industry IS NOT NULL
   AND a.industry <> ''
   AND NOT EXISTS (
     SELECT 1 FROM yucer_core.industry i
      WHERE i.workspace_id = a.workspace_id
        AND (i.industry_code = a.industry OR i.name = a.industry)
   )
ON CONFLICT (workspace_id, industry_code) DO NOTHING;

-- --- the customer joins the vocabulary by uuid -------------------------------
ALTER TABLE yucer_core.account
  ADD COLUMN IF NOT EXISTS industry_id UUID;

-- By name OR by code, because the seed above matched on either: a workspace
-- that typed 制造 lands on the shipped row, one that typed something else
-- lands on its own preserved row.
UPDATE yucer_core.account a
   SET industry_id = i.id
  FROM yucer_core.industry i
 WHERE a.industry_id IS NULL
   AND a.industry IS NOT NULL
   AND a.industry <> ''
   AND i.workspace_id = a.workspace_id
   AND (i.name = a.industry OR i.industry_code = a.industry);

-- NOT NULL is NOT set, and that is the difference from product.unit_id: an
-- account with no industry is the ordinary state of a fresh prospect, and the
-- completeness rule already treats the blank as a gap to fill rather than an
-- error to prevent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_account_industry') THEN
    ALTER TABLE yucer_core.account
      ADD CONSTRAINT fk_account_industry FOREIGN KEY (industry_id)
      REFERENCES yucer_core.industry (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_ws_industry
  ON yucer_core.account (workspace_id, industry_id);

-- The string leaves, exactly as product.category, product.status and
-- product.unit did before it.
ALTER TABLE yucer_core.account DROP COLUMN IF EXISTS industry;

-- --- grants -----------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON yucer_core.industry TO yucer_svc;
-- industry_code is the anchor - locked, like unit_code and reason_code.
GRANT UPDATE (name, sort_order, updated_at)
  ON yucer_core.industry TO yucer_svc;

-- account: `industry` leaves the writable set and `industry_id` takes its
-- place. Restated whole (REVOKE resets, then the full grant - the mirror's
-- parser understands this), and `province` is restated with it: 0035 added it
-- in a second statement, which a REVOKE here would otherwise drop.
REVOKE UPDATE ON yucer_core.account FROM yucer_svc;
GRANT UPDATE (name, industry_id, region, province, segment_code, owner_sub,
              health_score, tier, credit_code, website, employee_count,
              parent_id, status, updated_at, deleted_at)
  ON yucer_core.account TO yucer_svc;
