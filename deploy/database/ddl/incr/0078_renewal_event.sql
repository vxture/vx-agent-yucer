-- 0078_renewal_event.sql - what happened when a contract came up for renewal.
--
-- Authority: L4 batch two (customer panorama design, 2026-09-22), business
-- rules §9.1, and the owner's ruling of 2026-09-22 on the event vocabulary.
--
-- APPEND-ONLY, the shape of opportunity_stage_event and milestone_change: a
-- renewal outcome is a record of what somebody decided at the time, so a
-- correction is a new row. SELECT and INSERT only - no UPDATE, no DELETE, and
-- no updated_at column, because a column nothing may ever write reads as a
-- promise that something does.
--
-- THREE EVENT TYPES, AND EXPIRY IS NOT ONE OF THEM (owner, 2026-09-22). The
-- draft carried `expired`; it was dropped for the reason incr/0076 gives for
-- not storing an `expired` status - a term running out is already said by
-- contract.term_end, and an event for it would need a job to write it. The
-- three kept are all a person's judgement:
--   renewed    - a successor contract exists; successor_contract_id names it.
--   downgraded - renewed for less (fewer modules, lower value). Recorded
--                beside `renewed`, not instead of it.
--   lost       - the customer is not renewing.
--
-- THE LINEAGE ITSELF IS NOT HERE. "How many years running" walks
-- contract.renewed_from_contract_id (incr/0076, unique, frozen). This table
-- says what happened and who recorded it; the chain says what follows what.
-- successor_contract_id repeats the link for the `renewed` row only so the
-- audit trail reads on its own, and the CHECK keeps it from appearing on any
-- other type.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_delivery.renewal_event (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL,                     -- [ref] isolation key
  contract_id           UUID NOT NULL,
  event_type            VARCHAR(16) NOT NULL,
  successor_contract_id UUID,
  reason                VARCHAR(255),
  actor_sub             VARCHAR(128),                      -- [ref] who recorded it
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_renewal_event_type CHECK (event_type IN ('renewed', 'downgraded', 'lost')),
  -- A renewal names what it renewed into; nothing else names a successor.
  CONSTRAINT chk_renewal_event_successor CHECK (
    (event_type = 'renewed' AND successor_contract_id IS NOT NULL)
    OR (event_type <> 'renewed' AND successor_contract_id IS NULL)
  ),
  -- RESTRICT both ways: a contract with a renewal history cannot be deleted
  -- out from under it, the same reason fk_contract_renewed_from is RESTRICT.
  CONSTRAINT fk_renewal_event_contract FOREIGN KEY (contract_id)
    REFERENCES yucer_delivery.contract (id) ON DELETE RESTRICT,
  CONSTRAINT fk_renewal_event_successor FOREIGN KEY (successor_contract_id)
    REFERENCES yucer_delivery.contract (id) ON DELETE RESTRICT
);

COMMENT ON TABLE yucer_delivery.renewal_event IS
  '续约事件 - renewed / downgraded / lost, append-only. The lineage is contract.renewed_from_contract_id; see incr/0078.';

CREATE INDEX IF NOT EXISTS idx_renewal_event_ws_contract
  ON yucer_delivery.renewal_event (workspace_id, contract_id, occurred_at);

-- --- grants -----------------------------------------------------------------
--
-- Append-only is expressed by the grant, not by convention. 97 ran before this
-- table existed, so without this line it would have no privileges at all.
GRANT SELECT, INSERT ON yucer_delivery.renewal_event TO yucer_svc;
