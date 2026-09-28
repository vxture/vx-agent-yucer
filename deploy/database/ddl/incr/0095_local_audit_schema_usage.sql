-- 0095_local_audit_schema_usage.sql - the service role may enter local_audit.
--
-- incr/0023 created the schema and granted SELECT, INSERT on local_audit.event,
-- but never USAGE on the schema itself. A table privilege is unreachable
-- without it: every read and every write as yucer_svc answered
--
--   ERROR: permission denied for schema local_audit
--
-- which in production meant every copilot turn and every admin role change
-- failed at its audit write, and the audit page and 赋能分析 failed on read
-- (owner, 2026-09-28: "赋能分析报错 ... Digest: 839229873").
--
-- The other schemas an increment created (yucer_field, yucer_catalog,
-- yucer_ref) were granted USAGE in place; this was the only one missed.
-- check-incr-grants.mjs now asserts the pairing for schemas too.

GRANT USAGE ON SCHEMA local_audit TO yucer_svc;
