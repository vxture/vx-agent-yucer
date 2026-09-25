-- 0090_importance_and_priority.sql - 商机重要度与优先级 (deal batch 6a).
-- Design: YC-067 §08 (numbered 0088 there - numbers were tentative,
-- "以合并顺序为准"), YC-065 R11.
--
-- TWO INDEPENDENT AXES, BOTH DATA (owner 2026-09-24: 档位全部沉淀数据库, 不写死,
-- 为配置留扩展, 暂不过度开发):
--   the customer's TIER (account, shipped 战略级 / 关键级 / 普通级) and
--   the deal's IMPORTANCE (opportunity, shipped 核心 / 重点 / 一般).
-- A level carries a RANK (1 = most pressing); the medal colour and every rule
-- read the rank, never the name. The codes are anchors; names are editable.
--
-- PRIORITY IS DERIVED, NEVER STORED: tier x importance through priority_rule,
-- read at query time. Stored on the deal row, changing a customer's tier would
-- leave two truths. A missing cell is "未定级" and sorts last - never guessed.
--
-- No configuration UI or add/remove verbs yet - only the structure and the
-- seed; a workspace that needs a fourth level is a later decision.
--
-- account.tier STAYS for now: the customer page and the strategic roster read
-- it. tier_level_id joins it and is backfilled from it; designating a tier
-- writes both in one statement. A later increment drops the old column once
-- every read has moved.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_core.importance_level (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  subject       VARCHAR(16) NOT NULL,                 -- which axis: account | opportunity
  level_code    VARCHAR(32) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(64) NOT NULL,
  description   VARCHAR(255),
  rank          SMALLINT NOT NULL,                    -- 1 = most pressing
  is_default    BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_importance_level_subject CHECK (subject IN ('account', 'opportunity')),
  CONSTRAINT chk_importance_level_rank CHECK (rank >= 1),
  CONSTRAINT uidx_importance_level_code UNIQUE (workspace_id, subject, level_code),
  CONSTRAINT uidx_importance_level_rank UNIQUE (workspace_id, subject, rank)
);
-- Exactly one default per axis.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_importance_level_default
  ON yucer_core.importance_level (workspace_id, subject) WHERE is_default;

CREATE TABLE IF NOT EXISTS yucer_core.priority_rule (
  workspace_id          UUID NOT NULL,
  account_level_id      UUID NOT NULL REFERENCES yucer_core.importance_level (id) ON DELETE RESTRICT,
  opportunity_level_id  UUID NOT NULL REFERENCES yucer_core.importance_level (id) ON DELETE RESTRICT,
  priority              SMALLINT NOT NULL,            -- 1 = P1
  CONSTRAINT chk_priority_rule_priority CHECK (priority >= 1),
  PRIMARY KEY (workspace_id, account_level_id, opportunity_level_id)
);

ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS importance_level_id UUID REFERENCES yucer_core.importance_level (id) ON DELETE RESTRICT;
ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS importance_by_sub VARCHAR(128);    -- NULL = nobody has set it
ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS importance_at TIMESTAMPTZ;
ALTER TABLE yucer_core.account
  ADD COLUMN IF NOT EXISTS tier_level_id UUID REFERENCES yucer_core.importance_level (id) ON DELETE RESTRICT;

-- Seed, for every workspace that has a customer or a deal. A new workspace
-- gets the same rows from the service's first contact (0029 / 0040 practice).
INSERT INTO yucer_core.importance_level (workspace_id, subject, level_code, name, description, rank, is_default, sort_order)
SELECT w.workspace_id, v.subject, v.code, v.name, v.descr, v.rank, v.dflt, v.rank
  FROM (SELECT workspace_id FROM yucer_core.account UNION SELECT workspace_id FROM yucer_pipeline.opportunity) w
 CROSS JOIN (VALUES
   ('account',     'strategic', '战略级', '长期经营、高层互访的客户',       1, FALSE),
   ('account',     'key',       '关键级', '重点跟进、有扩大空间的客户',     2, FALSE),
   ('account',     'standard',  '普通级', '按常规节奏经营的客户',           3, TRUE),
   ('opportunity', 'core',      '核心',   '决定本期目标的单子',             1, FALSE),
   ('opportunity', 'major',     '重点',   '需要主管关注的单子',             2, FALSE),
   ('opportunity', 'normal',    '一般',   '按常规推进的单子',               3, TRUE)
 ) AS v(subject, code, name, descr, rank, dflt)
ON CONFLICT (workspace_id, subject, level_code) DO NOTHING;

-- The nine-cell matrix (R11): P1 P2 P4 / P2 P3 P5 / P3 P5 P6.
INSERT INTO yucer_core.priority_rule (workspace_id, account_level_id, opportunity_level_id, priority)
SELECT a.workspace_id, a.id, o.id, v.p
  FROM (VALUES
    ('strategic', 'core', 1), ('strategic', 'major', 2), ('strategic', 'normal', 4),
    ('key',       'core', 2), ('key',       'major', 3), ('key',       'normal', 5),
    ('standard',  'core', 3), ('standard',  'major', 5), ('standard',  'normal', 6)
  ) AS v(acc, opp, p)
  JOIN yucer_core.importance_level a ON a.subject = 'account' AND a.level_code = v.acc
  JOIN yucer_core.importance_level o ON o.subject = 'opportunity' AND o.level_code = v.opp AND o.workspace_id = a.workspace_id
ON CONFLICT (workspace_id, account_level_id, opportunity_level_id) DO NOTHING;

-- Backfill: every existing deal points at its workspace's default (一般);
-- every customer at the level its tier code names.
UPDATE yucer_pipeline.opportunity o
   SET importance_level_id = l.id
  FROM yucer_core.importance_level l
 WHERE o.importance_level_id IS NULL AND l.workspace_id = o.workspace_id
   AND l.subject = 'opportunity' AND l.is_default;
UPDATE yucer_core.account a
   SET tier_level_id = l.id
  FROM yucer_core.importance_level l
 WHERE a.tier_level_id IS NULL AND l.workspace_id = a.workspace_id
   AND l.subject = 'account' AND l.level_code = a.tier;

-- Grants. Levels: name / description / sort order edit; code, subject, rank
-- are anchors. The matrix: priority edits. Both deletable only while unused
-- (RESTRICT does that); no delete verb exists yet.
GRANT SELECT, INSERT, DELETE ON yucer_core.importance_level TO yucer_svc;
REVOKE UPDATE ON yucer_core.importance_level FROM yucer_svc;
GRANT UPDATE (name, description, sort_order, updated_at) ON yucer_core.importance_level TO yucer_svc;
GRANT SELECT, INSERT, DELETE ON yucer_core.priority_rule TO yucer_svc;
REVOKE UPDATE ON yucer_core.priority_rule FROM yucer_svc;
GRANT UPDATE (priority) ON yucer_core.priority_rule TO yucer_svc;

-- opportunity: restated whole (0080's list + the three importance columns).
REVOKE UPDATE ON yucer_pipeline.opportunity FROM yucer_svc;
GRANT UPDATE (name, plan_id, territory_id, owner_sub, stage, forecast_category,
              amount, currency, probability, requirement,
              contract_type_id, business_form_id,
              customer_budget, customer_budget_by_sub, customer_budget_at,
              importance_level_id, importance_by_sub, importance_at,
              expected_close_at, closed_at, status, updated_at, deleted_at)
  ON yucer_pipeline.opportunity TO yucer_svc;

-- account: restated whole (0072's list + tier_level_id).
REVOKE UPDATE ON yucer_core.account FROM yucer_svc;
GRANT UPDATE (name, industry_id, customer_type_id, customer_size_id, customer_nature_id,
              region, province, segment_code, owner_sub, health_score, status,
              tier, tier_level_id, credit_code, website, employee_count, parent_id, updated_at, deleted_at)
  ON yucer_core.account TO yucer_svc;
