-- 0055_org_unit_division.sql - a department linked directly to a 大区
-- (market division), not through a sales territory.
--
-- THE RULING (owner, 2026-09-11): 关联区域抽屉挂的是销售区域，跟区域设置的
-- 大区对不上 - 组织到大区之间应该有一条直连路径，不用绕销售区域一跳。
-- org_unit -> territory_unit -> territory_division -> market_division 已经
-- 存在，但那条路径回答的是"这个部门在哪片销售地盘上"，不是"这个部门归哪个
-- 大区"，两件事概念上不同，不该共用一张表。
--
-- 销售区域本身以后要整体撤销（owner 已经在别处立项跟踪），但那牵连销售
-- 目标口径、预测、线索路由、成员数据范围，是一次单独的多域改造 - 这次不做，
-- territory_unit/territory_division 原样保留，继续被 /planning 和这些域用着。
--
-- SAME SHAPE AS territory_division (0052): a pair table, 3-column composite
-- key including workspace_id (org_unit_division hangs off yucer_gtm the same
-- way territory_unit/territory_division do, not scoped transitively through
-- a parent row the way workspace_role_permission is). CASCADEs both ways: a
-- department without a 大区 and a 大区 nobody has claimed are both ordinary
-- states, and a link is not an object worth keeping alive on its own.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_gtm.org_unit_division (
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  unit_id       UUID NOT NULL,
  division_id   UUID NOT NULL,                        -- yucer_core.market_division, read-only reference
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_org_unit_division PRIMARY KEY (workspace_id, unit_id, division_id),
  CONSTRAINT fk_org_unit_division_unit FOREIGN KEY (unit_id) REFERENCES yucer_gtm.org_unit (id) ON DELETE CASCADE,
  CONSTRAINT fk_org_unit_division_division FOREIGN KEY (division_id) REFERENCES yucer_core.market_division (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_org_unit_division_division ON yucer_gtm.org_unit_division (workspace_id, division_id);
-- A link is a pair: insert and delete, no UPDATE at all (the shape
-- territory_unit/territory_division and workspace_role_permission have).
GRANT SELECT, INSERT, DELETE ON yucer_gtm.org_unit_division TO yucer_svc;
