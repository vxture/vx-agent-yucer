-- 0087_stage_exit_criterion.sql - 阶段退出条件 (deal batch 5a).
-- Design: YC-067 §03 (numbered 0083 there - the design's numbers were
-- tentative, "以合并顺序为准"), YC-065 R1.
--
-- WHAT THIS STAGE SHOULD HAVE GOT US. A stage is a claim - "we are in
-- negotiation" - and an exit criterion is a predicate the product can check
-- against data it already holds, not a checkbox somebody ticks. They belong to
-- the workspace's stage catalog (incr/0057) and are configured with it.
--
--   role_present             someone on this deal holds one of param.roles
--                            (an empty list: anyone at all is on the deal)
--   role_reached             one of param.roles took part in a follow-up on
--                            this deal within param.days
--   slot_filled              buying-evidence slot param.slot is written (incr/0085)
--   lines_priced             the deal has lines and none awaits a signature
--   their_commitments_clear  nothing the customer promised on this deal is overdue
--   close_date_valid         the expected close date is today or later
--
-- KIND IS LOCKED: changing how a criterion is judged is a delete and an
-- insert, not an edit - a criterion's meaning in the history must not be
-- swapped quietly. name / param / sort_order are editable. param's shape is
-- checked by the application per kind; the database only insists on an object.
--
-- SEEDED ONCE, NEVER RE-SEEDED: the R1 factory set for every workspace that
-- already has a stage catalog, only for the codes it still has. A new
-- workspace gets the same set on the path that first seeds its catalog. A
-- workspace that later deletes them all has none - empty is a decision.
-- (R1's 决策标准已写明 waits for the itemised criteria of a later increment.)
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_pipeline.stage_exit_criterion (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  stage_code    VARCHAR(32) NOT NULL,
  kind          VARCHAR(24) NOT NULL,
  param         JSONB NOT NULL DEFAULT '{}'::jsonb,
  name          VARCHAR(255) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_exit_criterion_kind CHECK (kind IN (
    'role_present', 'role_reached', 'slot_filled', 'lines_priced', 'their_commitments_clear', 'close_date_valid'
  )),
  CONSTRAINT chk_exit_criterion_param CHECK (jsonb_typeof(param) = 'object'),
  CONSTRAINT chk_exit_criterion_name CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT fk_exit_criterion_stage FOREIGN KEY (workspace_id, stage_code)
    REFERENCES yucer_pipeline.stage_definition (workspace_id, stage_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exit_criterion_stage
  ON yucer_pipeline.stage_exit_criterion (workspace_id, stage_code, sort_order);

GRANT SELECT, INSERT, DELETE ON yucer_pipeline.stage_exit_criterion TO yucer_svc;
REVOKE UPDATE ON yucer_pipeline.stage_exit_criterion FROM yucer_svc;
GRANT UPDATE (name, param, sort_order, updated_at) ON yucer_pipeline.stage_exit_criterion TO yucer_svc;

-- The R1 factory set, once, for catalogs that exist and have no criteria yet.
INSERT INTO yucer_pipeline.stage_exit_criterion (workspace_id, stage_code, kind, param, name, sort_order)
SELECT d.workspace_id, v.stage, v.kind, v.param::jsonb, v.name, v.ord
  FROM yucer_pipeline.stage_definition d
  JOIN (VALUES
    ('qualify',   'slot_filled',             '{"slot":"pain"}',                           '痛点已写明',               1),
    ('qualify',   'role_present',            '{"roles":[]}',                              '至少一位联系人在本单',     2),
    ('discover',  'role_present',            '{"roles":["economic"]}',                    '已标注经济决策人',         1),
    ('discover',  'slot_filled',             '{"slot":"metrics"}',                        '量化价值已写明',           2),
    ('validate',  'role_reached',            '{"roles":["economic"],"days":30}',          '经济决策人 30 天内触达',   1),
    ('validate',  'role_present',            '{"roles":["coach","technical"]}',           '已有教练或技术评估人',     2),
    ('validate',  'slot_filled',             '{"slot":"decision_process"}',               '决策流程已写明',           3),
    ('propose',   'lines_priced',            '{}',                                        '明细已定价',               1),
    ('propose',   'slot_filled',             '{"slot":"paper_process"}',                  '签约流程已写明',           2),
    ('propose',   'their_commitments_clear', '{}',                                        '对方承诺无逾期',           3),
    ('negotiate', 'lines_priced',            '{}',                                        '明细已定价',               1),
    ('negotiate', 'close_date_valid',        '{}',                                        '成交日未过',               2),
    ('negotiate', 'their_commitments_clear', '{}',                                        '对方承诺无逾期',           3)
  ) AS v(stage, kind, param, name, ord) ON v.stage = d.stage_code
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_pipeline.stage_exit_criterion c WHERE c.workspace_id = d.workspace_id
 );
