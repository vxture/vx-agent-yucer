-- 0056_rename_account_line.sql - 客户与商机开发 -> 商拓.
--
-- THE RULING (owner, 2026-09-12): 业务线名称改成"商拓"（2字，行业通用的
-- "商务拓展"/BD 简称），从"客户与商机开发"（7字）改过来 - 名字太长。
--
-- SAME PATTERN AS 0049's 集团与通用 -> 管理: `UPDATE ... WHERE line_code =
-- 'account' AND name = '客户与商机开发'` matches only rows still carrying
-- the shipped name, so a workspace that already renamed this line on its
-- own is left alone - a renamed row is the tenant's, not this increment's
-- to overwrite. Idempotent (WHERE clause makes a second run a no-op).
UPDATE local_authz.role_line SET name = '商拓', updated_at = now()
 WHERE line_code = 'account' AND name = '客户与商机开发';
