-- 0051_org_structure.sql - 组织结构: units the workspace defines, in kinds it
-- names, from templates the platform ships.
--
-- THE RULING (owner, 2026-09-10): 组织结构是完全可以自定义的；提供平台预置模版，
-- 多套模版作基准；模版覆盖集团型大公司、中规模全国组织、小规模简单团队，默认中
-- 规模全国公司，总部-大区-团队三级架构。
--
-- WHAT THIS LEAVES BEHIND, the shape every configuration here has:
--
-- 1. yucer_ref.org_template / org_template_unit - the three shipped
--    templates as reference rows (集团型大公司 21 units, 中规模全国公司 15,
--    小规模简单团队 4), read-only to the service, applied by copying.
-- 2. yucer_gtm.org_unit_kind - 单位类型 as a per-workspace vocabulary (总部 /
--    事业部 / 大区 / 分公司 / 团队 shipped), the industry shape.
-- 3. yucer_gtm.org_unit - the tree: code (locked), name, kind (by id), parent
--    (by id, RESTRICT), leader (a member's sub), order among siblings.
-- 4. yucer_gtm.org_unit_member - which unit a member belongs to, ONE per
--    (workspace, sub); the row goes with the unit (CASCADE), so a template
--    applied over a staffed tree un-places people rather than stranding
--    them under a unit that no longer exists - the service says how many.
--
-- IN yucer_gtm, beside 销售区域: the organisation is a planning object - a
-- territory is what a unit works, and the next batch (按组织 data scope)
-- links the two. Members stay in local_authz with no foreign key here, the
-- rule member_territory already follows: authz sits under the domains.
--
-- Workspaces that already have members receive the kinds and the DEFAULT
-- template, guarded on an EMPTY table each, so a re-run and a tenant's
-- deletions are both respected. A workspace seen later is materialised by
-- the application on first contact.
-- Idempotent throughout.

-- ============================================================================
-- 1. The templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS yucer_ref.org_template (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key  VARCHAR(32) NOT NULL,
  name          VARCHAR(64) NOT NULL,
  description   VARCHAR(500) NOT NULL DEFAULT '',
  is_default    BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uidx_org_template_key UNIQUE (template_key)
);
CREATE TABLE IF NOT EXISTS yucer_ref.org_template_unit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL,
  parent_id     UUID,
  unit_code     VARCHAR(64) NOT NULL,
  kind_code     VARCHAR(32) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uidx_org_template_unit_code UNIQUE (template_id, unit_code),
  CONSTRAINT fk_org_template_unit_template FOREIGN KEY (template_id) REFERENCES yucer_ref.org_template (id) ON DELETE CASCADE,
  CONSTRAINT fk_org_template_unit_parent FOREIGN KEY (parent_id) REFERENCES yucer_ref.org_template_unit (id) ON DELETE CASCADE
);
GRANT SELECT ON yucer_ref.org_template TO yucer_svc;
GRANT SELECT ON yucer_ref.org_template_unit TO yucer_svc;

INSERT INTO yucer_ref.org_template (template_key, name, description, is_default, sort_order) VALUES
  ('group_large', '集团型大公司', '集团总部 → 事业部 → 大区 → 分公司 → 团队，五级；两个事业部各带三个大区作骨架，改名即用。', false, 1),
  ('national_medium', '中规模全国公司', '总部 → 大区 → 团队，三级；七个大区与七分法一致，每区一个销售团队。默认方案。', true, 2),
  ('small_team', '小规模简单团队', '总部下直接是销售、售前、交付三个团队，两级。', false, 3)
ON CONFLICT (template_key) DO NOTHING;

-- Units in tree order; the parent is resolved by (template, code) after the
-- rows exist, so one statement inserts and a second links.
INSERT INTO yucer_ref.org_template_unit (template_id, unit_code, kind_code, name, sort_order)
SELECT t.id, v.code, v.kind, v.name, v.ord
  FROM (VALUES
  ('group_large', 'headquarters', NULL, 'headquarters', '集团总部', 1),
  ('group_large', 'bu1', 'headquarters', 'division', '事业部一', 2),
  ('group_large', 'bu1_north', 'bu1', 'region', '华北大区', 3),
  ('group_large', 'bu1_north_branch', 'bu1_north', 'branch', '华北分公司', 4),
  ('group_large', 'bu1_north_team1', 'bu1_north_branch', 'team', '销售一部', 5),
  ('group_large', 'bu1_east', 'bu1', 'region', '华东大区', 6),
  ('group_large', 'bu1_east_branch', 'bu1_east', 'branch', '华东分公司', 7),
  ('group_large', 'bu1_east_team1', 'bu1_east_branch', 'team', '销售一部', 8),
  ('group_large', 'bu1_south', 'bu1', 'region', '华南大区', 9),
  ('group_large', 'bu1_south_branch', 'bu1_south', 'branch', '华南分公司', 10),
  ('group_large', 'bu1_south_team1', 'bu1_south_branch', 'team', '销售一部', 11),
  ('group_large', 'bu2', 'headquarters', 'division', '事业部二', 12),
  ('group_large', 'bu2_north', 'bu2', 'region', '华北大区', 13),
  ('group_large', 'bu2_north_branch', 'bu2_north', 'branch', '华北分公司', 14),
  ('group_large', 'bu2_north_team1', 'bu2_north_branch', 'team', '销售一部', 15),
  ('group_large', 'bu2_east', 'bu2', 'region', '华东大区', 16),
  ('group_large', 'bu2_east_branch', 'bu2_east', 'branch', '华东分公司', 17),
  ('group_large', 'bu2_east_team1', 'bu2_east_branch', 'team', '销售一部', 18),
  ('group_large', 'bu2_south', 'bu2', 'region', '华南大区', 19),
  ('group_large', 'bu2_south_branch', 'bu2_south', 'branch', '华南分公司', 20),
  ('group_large', 'bu2_south_team1', 'bu2_south_branch', 'team', '销售一部', 21),
  ('national_medium', 'headquarters', NULL, 'headquarters', '总部', 1),
  ('national_medium', 'north', 'headquarters', 'region', '华北大区', 2),
  ('national_medium', 'north_team1', 'north', 'team', '销售一部', 3),
  ('national_medium', 'northeast', 'headquarters', 'region', '东北大区', 4),
  ('national_medium', 'northeast_team1', 'northeast', 'team', '销售一部', 5),
  ('national_medium', 'east', 'headquarters', 'region', '华东大区', 6),
  ('national_medium', 'east_team1', 'east', 'team', '销售一部', 7),
  ('national_medium', 'central', 'headquarters', 'region', '华中大区', 8),
  ('national_medium', 'central_team1', 'central', 'team', '销售一部', 9),
  ('national_medium', 'south', 'headquarters', 'region', '华南大区', 10),
  ('national_medium', 'south_team1', 'south', 'team', '销售一部', 11),
  ('national_medium', 'southwest', 'headquarters', 'region', '西南大区', 12),
  ('national_medium', 'southwest_team1', 'southwest', 'team', '销售一部', 13),
  ('national_medium', 'northwest', 'headquarters', 'region', '西北大区', 14),
  ('national_medium', 'northwest_team1', 'northwest', 'team', '销售一部', 15),
  ('small_team', 'headquarters', NULL, 'headquarters', '总部', 1),
  ('small_team', 'sales', 'headquarters', 'team', '销售团队', 2),
  ('small_team', 'presales', 'headquarters', 'team', '售前团队', 3),
  ('small_team', 'delivery', 'headquarters', 'team', '交付团队', 4)
  ) AS v(template_key, code, parent_code, kind, name, ord)
  JOIN yucer_ref.org_template t ON t.template_key = v.template_key
ON CONFLICT (template_id, unit_code) DO NOTHING;

UPDATE yucer_ref.org_template_unit u SET parent_id = p.id
  FROM (VALUES
  ('group_large', 'headquarters', NULL, 'headquarters', '集团总部', 1),
  ('group_large', 'bu1', 'headquarters', 'division', '事业部一', 2),
  ('group_large', 'bu1_north', 'bu1', 'region', '华北大区', 3),
  ('group_large', 'bu1_north_branch', 'bu1_north', 'branch', '华北分公司', 4),
  ('group_large', 'bu1_north_team1', 'bu1_north_branch', 'team', '销售一部', 5),
  ('group_large', 'bu1_east', 'bu1', 'region', '华东大区', 6),
  ('group_large', 'bu1_east_branch', 'bu1_east', 'branch', '华东分公司', 7),
  ('group_large', 'bu1_east_team1', 'bu1_east_branch', 'team', '销售一部', 8),
  ('group_large', 'bu1_south', 'bu1', 'region', '华南大区', 9),
  ('group_large', 'bu1_south_branch', 'bu1_south', 'branch', '华南分公司', 10),
  ('group_large', 'bu1_south_team1', 'bu1_south_branch', 'team', '销售一部', 11),
  ('group_large', 'bu2', 'headquarters', 'division', '事业部二', 12),
  ('group_large', 'bu2_north', 'bu2', 'region', '华北大区', 13),
  ('group_large', 'bu2_north_branch', 'bu2_north', 'branch', '华北分公司', 14),
  ('group_large', 'bu2_north_team1', 'bu2_north_branch', 'team', '销售一部', 15),
  ('group_large', 'bu2_east', 'bu2', 'region', '华东大区', 16),
  ('group_large', 'bu2_east_branch', 'bu2_east', 'branch', '华东分公司', 17),
  ('group_large', 'bu2_east_team1', 'bu2_east_branch', 'team', '销售一部', 18),
  ('group_large', 'bu2_south', 'bu2', 'region', '华南大区', 19),
  ('group_large', 'bu2_south_branch', 'bu2_south', 'branch', '华南分公司', 20),
  ('group_large', 'bu2_south_team1', 'bu2_south_branch', 'team', '销售一部', 21),
  ('national_medium', 'headquarters', NULL, 'headquarters', '总部', 1),
  ('national_medium', 'north', 'headquarters', 'region', '华北大区', 2),
  ('national_medium', 'north_team1', 'north', 'team', '销售一部', 3),
  ('national_medium', 'northeast', 'headquarters', 'region', '东北大区', 4),
  ('national_medium', 'northeast_team1', 'northeast', 'team', '销售一部', 5),
  ('national_medium', 'east', 'headquarters', 'region', '华东大区', 6),
  ('national_medium', 'east_team1', 'east', 'team', '销售一部', 7),
  ('national_medium', 'central', 'headquarters', 'region', '华中大区', 8),
  ('national_medium', 'central_team1', 'central', 'team', '销售一部', 9),
  ('national_medium', 'south', 'headquarters', 'region', '华南大区', 10),
  ('national_medium', 'south_team1', 'south', 'team', '销售一部', 11),
  ('national_medium', 'southwest', 'headquarters', 'region', '西南大区', 12),
  ('national_medium', 'southwest_team1', 'southwest', 'team', '销售一部', 13),
  ('national_medium', 'northwest', 'headquarters', 'region', '西北大区', 14),
  ('national_medium', 'northwest_team1', 'northwest', 'team', '销售一部', 15),
  ('small_team', 'headquarters', NULL, 'headquarters', '总部', 1),
  ('small_team', 'sales', 'headquarters', 'team', '销售团队', 2),
  ('small_team', 'presales', 'headquarters', 'team', '售前团队', 3),
  ('small_team', 'delivery', 'headquarters', 'team', '交付团队', 4)
  ) AS v(template_key, code, parent_code, kind, name, ord)
  JOIN yucer_ref.org_template t ON t.template_key = v.template_key
  JOIN yucer_ref.org_template_unit p ON p.template_id = t.id AND p.unit_code = v.parent_code
 WHERE u.template_id = t.id AND u.unit_code = v.code AND u.parent_id IS DISTINCT FROM p.id;

-- ============================================================================
-- 2. 单位类型
-- ============================================================================
CREATE TABLE IF NOT EXISTS yucer_gtm.org_unit_kind (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  kind_code     VARCHAR(32) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(64) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_org_unit_kind_code UNIQUE (workspace_id, kind_code),
  CONSTRAINT chk_org_unit_kind_code CHECK (kind_code ~ '^[a-z][a-z0-9_]{0,31}$')
);
CREATE INDEX IF NOT EXISTS idx_org_unit_kind_ws_sort ON yucer_gtm.org_unit_kind (workspace_id, sort_order);
GRANT SELECT, INSERT, DELETE ON yucer_gtm.org_unit_kind TO yucer_svc;
GRANT UPDATE (name, sort_order, updated_at) ON yucer_gtm.org_unit_kind TO yucer_svc;

-- ============================================================================
-- 3. The units
-- ============================================================================
CREATE TABLE IF NOT EXISTS yucer_gtm.org_unit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  unit_code     VARCHAR(64) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(255) NOT NULL,
  kind_id       UUID NOT NULL,
  parent_id     UUID,
  leader_sub    VARCHAR(128),                         -- [ref] a member's sub, as member_territory carries it
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_org_unit_code UNIQUE (workspace_id, unit_code),
  CONSTRAINT chk_org_unit_code CHECK (unit_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT fk_org_unit_kind FOREIGN KEY (kind_id) REFERENCES yucer_gtm.org_unit_kind (id) ON DELETE RESTRICT,
  CONSTRAINT fk_org_unit_parent FOREIGN KEY (parent_id) REFERENCES yucer_gtm.org_unit (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_org_unit_ws_parent ON yucer_gtm.org_unit (workspace_id, parent_id, sort_order);
GRANT SELECT, INSERT, DELETE ON yucer_gtm.org_unit TO yucer_svc;
GRANT UPDATE (name, kind_id, parent_id, leader_sub, sort_order, updated_at) ON yucer_gtm.org_unit TO yucer_svc;

-- ============================================================================
-- 4. Who belongs where
-- ============================================================================
CREATE TABLE IF NOT EXISTS yucer_gtm.org_unit_member (
  workspace_id  UUID NOT NULL,
  sub           VARCHAR(128) NOT NULL,                -- [ref] the member, no FK across to local_authz
  unit_id       UUID NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_org_unit_member PRIMARY KEY (workspace_id, sub),
  CONSTRAINT fk_org_unit_member_unit FOREIGN KEY (unit_id) REFERENCES yucer_gtm.org_unit (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_org_unit_member_unit ON yucer_gtm.org_unit_member (unit_id);
GRANT SELECT, INSERT, DELETE ON yucer_gtm.org_unit_member TO yucer_svc;
GRANT UPDATE (unit_id, updated_at) ON yucer_gtm.org_unit_member TO yucer_svc;

-- ============================================================================
-- 5. Workspaces that already have members: the kinds, then the default tree
-- ============================================================================
INSERT INTO yucer_gtm.org_unit_kind (workspace_id, kind_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM local_authz.member) w
 CROSS JOIN (VALUES
    ('headquarters', '总部', 1),
    ('division', '事业部', 2),
    ('region', '大区', 3),
    ('branch', '分公司', 4),
    ('team', '团队', 5)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (SELECT 1 FROM yucer_gtm.org_unit_kind k WHERE k.workspace_id = w.workspace_id)
ON CONFLICT (workspace_id, kind_code) DO NOTHING;

-- The default template, copied in tree order (parents first by sort_order,
-- resolved by code afterwards), only where the workspace has no units.
INSERT INTO yucer_gtm.org_unit (workspace_id, unit_code, name, kind_id, sort_order)
SELECT w.workspace_id, tu.unit_code, tu.name, k.id, tu.sort_order
  FROM (SELECT DISTINCT workspace_id FROM local_authz.member) w
  JOIN yucer_ref.org_template t ON t.is_default
  JOIN yucer_ref.org_template_unit tu ON tu.template_id = t.id
  JOIN yucer_gtm.org_unit_kind k ON k.workspace_id = w.workspace_id AND k.kind_code = tu.kind_code
 WHERE NOT EXISTS (SELECT 1 FROM yucer_gtm.org_unit u WHERE u.workspace_id = w.workspace_id)
ON CONFLICT (workspace_id, unit_code) DO NOTHING;

UPDATE yucer_gtm.org_unit u SET parent_id = p.id
  FROM yucer_ref.org_template t
  JOIN yucer_ref.org_template_unit tu ON tu.template_id = t.id
  JOIN yucer_ref.org_template_unit tp ON tp.id = tu.parent_id
  JOIN yucer_gtm.org_unit p ON p.unit_code = tp.unit_code
 WHERE t.is_default AND u.unit_code = tu.unit_code AND p.workspace_id = u.workspace_id
   AND u.parent_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM yucer_gtm.org_unit x WHERE x.workspace_id = u.workspace_id AND x.parent_id IS NOT NULL);
