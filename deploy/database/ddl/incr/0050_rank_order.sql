-- 0050_rank_order.sql - the 层级 vocabulary reads top rung first.
--
-- THE RULING (owner, 2026-09-10): 业务线的顺序改了，层级配置的顺序还没改. 0048
-- turned the roster over - rank from the top down inside each line - but the
-- 层级 list a workspace configures and picks from still ran 专员 first. The
-- shipped order is 高管 / 总经理 / 总监 / 高级经理 / 经理 / 专员 now, the same
-- direction the roster reads.
--
-- And the bottom rung reads 专员 (owner: 专员/代表，改为专员) - 代表 was a
-- gloss on the 销售代表 who stands there, not a rung of its own.
--
-- Workspace rows follow ONLY where the workspace never re-ordered its ranks
-- (all six shipped codes still at 0047's numbers). A workspace that moved
-- one rung keeps its order - the column is theirs (0047).
-- Idempotent.

UPDATE local_authz.role_rank SET name = '专员', updated_at = now()
 WHERE rank_code = 'staff' AND name = '专员 / 代表';

WITH old AS (
  SELECT * FROM (VALUES
    ('staff',           1),
    ('manager',         2),
    ('senior',          3),
    ('director',        4),
    ('general_manager', 5),
    ('executive',       6)
  ) AS o(code, ord)
),
untouched AS (
  SELECT r.workspace_id
    FROM local_authz.role_rank r
    JOIN old ON old.code = r.rank_code
   GROUP BY r.workspace_id
  HAVING bool_and(r.sort_order = old.ord) AND count(*) = 6
)
UPDATE local_authz.role_rank r SET sort_order = v.ord, updated_at = now()
  FROM (VALUES
    ('executive',       1),
    ('general_manager', 2),
    ('director',        3),
    ('senior',          4),
    ('manager',         5),
    ('staff',           6)
  ) AS v(code, ord)
 WHERE r.rank_code = v.code
   AND r.workspace_id IN (SELECT workspace_id FROM untouched)
   AND r.sort_order <> v.ord;
