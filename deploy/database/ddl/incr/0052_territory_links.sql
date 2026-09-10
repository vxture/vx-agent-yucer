-- 0052_territory_links.sql - the joints between the organisation and the map,
-- and the scope that reads them.
--
-- THE RULING (owner, 2026-09-10): 按组织数据范围，territory 挂到单位；一个销售
-- 区域可挂多个单位；单位范围 = 本单位子树成员持有的 + 子树区域覆盖的客户；
-- 销售区域与大区的关联这批一起改为 id 关联；关联关系在单位、区域、大区三面展示。
--
-- WHAT THIS LEAVES BEHIND:
--
-- 1. yucer_gtm.territory_unit - which units WORK a territory. Many-to-many:
--    a territory is a team working that ground, and two units may share it.
--    A link goes with either side (CASCADE): a territory without a unit and a
--    unit without a territory are both ordinary states, and a link is not an
--    object anybody would want kept alive on its own.
-- 2. yucer_gtm.territory_division - which 大区 a territory COVERS, by id.
--    Until now this was territory.regions, a JSONB list of 大区 NAMES matched
--    against account.region; renaming a 大区 silently emptied every
--    territory that named it (the form even carried an "已不在当前划分中"
--    flag for the orphans). The names are resolved to ids here, once; a name
--    no current 大区 carries was covering nothing a reader could see and is
--    dropped. `territory.regions` STAYS (an increment never drops a column)
--    and is no longer written: the application derives the names from the
--    link at read time, so routing, the scope resolver and the completeness
--    rule keep reading `regions` and stop drifting.
--    The 大区 side CASCADEs too: deleting a 大区 withdraws its coverage; the
--    admin surface says how many territories that touches before the click.
-- 3. local_authz.member.scope admits 'unit': the member sees what their
--    organisation sees - rows held by anyone in their unit's subtree, the
--    customers on the ground of the subtree's territories, and 未分区 as
--    ruled for the territory scope. Nothing to assign; being placed in a
--    unit (0051) is the whole configuration.
--
-- Idempotent throughout.

-- ============================================================================
-- 1. territory <-> unit
-- ============================================================================
CREATE TABLE IF NOT EXISTS yucer_gtm.territory_unit (
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  territory_id  UUID NOT NULL,
  unit_id       UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_territory_unit PRIMARY KEY (workspace_id, territory_id, unit_id),
  CONSTRAINT fk_territory_unit_territory FOREIGN KEY (territory_id) REFERENCES yucer_gtm.territory (id) ON DELETE CASCADE,
  CONSTRAINT fk_territory_unit_unit FOREIGN KEY (unit_id) REFERENCES yucer_gtm.org_unit (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_territory_unit_unit ON yucer_gtm.territory_unit (workspace_id, unit_id);
-- A link is a pair: insert and delete, no UPDATE at all (the shape
-- member_territory and workspace_role_permission have).
GRANT SELECT, INSERT, DELETE ON yucer_gtm.territory_unit TO yucer_svc;

-- ============================================================================
-- 2. territory <-> 大区, by id
-- ============================================================================
CREATE TABLE IF NOT EXISTS yucer_gtm.territory_division (
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  territory_id  UUID NOT NULL,
  division_id   UUID NOT NULL,                        -- yucer_core.market_division, read-only reference
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_territory_division PRIMARY KEY (workspace_id, territory_id, division_id),
  CONSTRAINT fk_territory_division_territory FOREIGN KEY (territory_id) REFERENCES yucer_gtm.territory (id) ON DELETE CASCADE,
  CONSTRAINT fk_territory_division_division FOREIGN KEY (division_id) REFERENCES yucer_core.market_division (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_territory_division_division ON yucer_gtm.territory_division (workspace_id, division_id);
GRANT SELECT, INSERT, DELETE ON yucer_gtm.territory_division TO yucer_svc;

-- The names become ids, once. A territory's `regions` entry that names a 大区
-- of its own workspace becomes a link; anything else is dropped (see header).
INSERT INTO yucer_gtm.territory_division (workspace_id, territory_id, division_id)
SELECT t.workspace_id, t.id, d.id
  FROM yucer_gtm.territory t
 CROSS JOIN LATERAL jsonb_array_elements_text(t.regions) AS r(name)
  JOIN yucer_core.market_division d ON d.workspace_id = t.workspace_id AND d.name = r.name
ON CONFLICT (workspace_id, territory_id, division_id) DO NOTHING;

-- ============================================================================
-- 3. the unit scope
-- ============================================================================
ALTER TABLE local_authz.member DROP CONSTRAINT IF EXISTS chk_member_scope;
ALTER TABLE local_authz.member
  ADD CONSTRAINT chk_member_scope
  CHECK (scope IN ('workspace', 'territory', 'own', 'unit'));
