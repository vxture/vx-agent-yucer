-- 0093_stage_names_propose_negotiate.sql - two stage names, order unchanged.
--
-- Authority: owner, 2026-09-26. "报价投标 -> 商务谈判" mixed two procurement
-- paths. A non-tender deal quotes first and then negotiates price and terms;
-- a tender forbids substantive negotiation between the bid and the award
-- (Tendering and Bidding Law, art. 43), so after the bid there is only the
-- award and the signing. Renamed so both paths read true, with order and
-- default win rates untouched:
--
--   propose    报价投标 -> 方案报价   (a quote or a bid has been submitted)
--   negotiate  商务谈判 -> 谈判签约   (non-tender negotiation, or signing on
--                                      the award's terms)
--
-- ONLY ROWS STILL CARRYING THE FACTORY NAME. A workspace that renamed the
-- stage in /admin/opportunity made its own call and keeps it. Codes are
-- untouched, so every opportunity, journal row and FK stays as it is.
--
-- Idempotent: a second run matches nothing.

UPDATE yucer_pipeline.stage_definition
   SET name = '方案报价', updated_at = now()
 WHERE stage_code = 'propose' AND name = '报价投标';

UPDATE yucer_pipeline.stage_definition
   SET name = '谈判签约', updated_at = now()
 WHERE stage_code = 'negotiate' AND name = '商务谈判';
