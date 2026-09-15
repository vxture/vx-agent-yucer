-- 0070_usage_platform_event_id.sql - keep the platform's own usage-event id
-- alongside the row it belongs to, so reconciliation has something to join on.
--
-- WHY. POST /usage/consume's 200 body carries event_id - the id the PLATFORM
-- wrote the usage event under. On a replay (the same idempotency_key sent
-- twice) it returns the ORIGINAL event's id, which is exactly what makes it
-- useful: matching a local row to a platform ledger entry by id, rather than
-- by hoping workspace_id + metric + amount + a timestamp window line up.
-- Today that id is parsed out of the response and then dropped - it was read
-- only by the manual c3-replay self-test probe (api/platform-check), never
-- persisted, so reconciliation-by-platform-event-id has never been possible
-- from stored data.
--
-- NULL until flushed - a row buffered but not yet reported has no platform
-- event to point at. Left NULL forever on the retried-forever branch (a
-- non-200 response) for the same reason.
ALTER TABLE local_usage.raw
  ADD COLUMN IF NOT EXISTS platform_event_id VARCHAR(128);

REVOKE UPDATE ON local_usage.raw FROM yucer_svc;
GRANT UPDATE (flushed, platform_event_id) ON local_usage.raw TO yucer_svc;
