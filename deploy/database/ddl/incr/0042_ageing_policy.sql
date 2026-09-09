-- 0042_ageing_policy.sql - 账龄分档 stops being two numbers in the build.
--
-- Authority: owner, 2026-09-08, same batch as 0041.
--
-- WHAT IT WAS: `if (late <= 30) ... if (late <= 60) ...` inside
-- domains/delivery/lib/collection-stats.ts, with the five band names spelled
-- out in the message catalogue beside them. 30/60/60+ is one common way to age
-- a receivable; 30/60/90 is another, and a company that ages at 45 days had no
-- way to say so.
--
-- WHAT IS DATA AND WHAT IS NOT (ADR-026's test again). The CUTOFFS are the
-- finance team's ageing policy - nothing branches on 30, and the chart simply
-- draws whatever bands come out. The two bands at the ends are NOT: 未到期 and
-- 未填到期日 exist in every possible policy, one because money that is early is
-- the healthy part of a schedule and the other because a row with no due date
-- is not early, it is unmeasurable. They stay in the rule.
--
-- AN ARRAY, NOT ROWS. The cutoffs are read whole, every time, by one function
-- that turns them into bands; nothing looks one up, joins to it or filters by
-- it. That is what ADR-026 calls a value rather than a table, and rows would
-- add an ordering column, a unique index and a delete path to express a list
-- of at most five small integers.
--
-- ONE ROW PER WORKSPACE and no DELETE grant, for the same reasons 0041 states.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_delivery.ageing_policy (
  workspace_id UUID PRIMARY KEY,                      -- [ref] isolation key
  -- Where each late band ENDS, in days overdue, ascending. '{30,60}' produces
  -- 1-30 / 31-60 / 60+ - the last band is always open-ended, which is why the
  -- array holds cutoffs rather than bands.
  late_cutoffs SMALLINT[] NOT NULL DEFAULT '{30,60}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- At least one cutoff, or there are no late bands at all and the chart says
  -- only "late" - which is the question the chart exists to break down. Five is
  -- where a bar chart stops being readable, and it is also what makes the
  -- ascending CHECK below expressible.
  CONSTRAINT chk_ageing_policy_size
    CHECK (cardinality(late_cutoffs) BETWEEN 1 AND 5),
  CONSTRAINT chk_ageing_policy_positive
    CHECK (0 < ALL (late_cutoffs)),
  -- STRICTLY ASCENDING. Out of order, the bands would overlap and a row would
  -- fall in whichever the loop tested first; equal, one band would be empty by
  -- construction. Postgres cannot express "sorted" over an array without a
  -- subquery, so with a maximum of five entries it is written out - which is
  -- the honest trade rather than leaving the rule as the only guard.
  CONSTRAINT chk_ageing_policy_ascending CHECK (
    (cardinality(late_cutoffs) < 2 OR late_cutoffs[1] < late_cutoffs[2]) AND
    (cardinality(late_cutoffs) < 3 OR late_cutoffs[2] < late_cutoffs[3]) AND
    (cardinality(late_cutoffs) < 4 OR late_cutoffs[3] < late_cutoffs[4]) AND
    (cardinality(late_cutoffs) < 5 OR late_cutoffs[4] < late_cutoffs[5])
  )
);

-- The shipped cutoffs, for every workspace that already has a schedule to age.
INSERT INTO yucer_delivery.ageing_policy (workspace_id)
SELECT DISTINCT workspace_id FROM yucer_delivery.revenue_schedule
ON CONFLICT (workspace_id) DO NOTHING;

-- --- grants -----------------------------------------------------------------
GRANT SELECT, INSERT ON yucer_delivery.ageing_policy TO yucer_svc;
GRANT UPDATE (late_cutoffs, updated_at) ON yucer_delivery.ageing_policy TO yucer_svc;
