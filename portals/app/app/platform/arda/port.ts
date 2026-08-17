import type { NewSignal } from "../../domains/signal/store";

// arda - the shared-data plane, stage 1 (ADR-011).
//
// arda is an INBOUND FACT SOURCE. Not a store, not a master. One arda record
// becomes one yucer_pipeline.signal row through the existing recordSignal port,
// and nothing else among the 37 tables learns that arda exists.
//
// THE ONE PROPERTY THAT MAKES THIS PORT SAFE TO WRITE BEFORE THE CONTRACT
// ARRIVES: it returns NewSignal - a type this repo already owns, already froze
// at the database, and already ships a UI for. There is no arda field name, no
// arda type, no URL anywhere in this file.
//
// That is the line ADR-007 records the hard way. A guess about a WIRE FORMAT
// can be quarantined in an adapter. A guess about a VOCABULARY YOU DO NOT OWN
// cannot - when it turns out wrong, the port is wrong and every call site built
// on it is wrong. The discarded karda module authored a knowledge vocabulary;
// this one borrows yucer's own.
//
// Ownership, expressed in the split the database already enforces:
//
//   arda may supply only the FROZEN EVIDENCE half of a signal - source,
//   source_ref, signal_type, subject, payload, detected_at. Those columns have
//   no UPDATE grant, so a wrong value is repairable only by a db-init data
//   correction.
//
//   yucer owns the RESOLUTION half absolutely - account_id, score, status.
//   arda never supplies them. Anything carrying a yucer business number is
//   yucer's and never leaves.
//
//   Note the asymmetry: the resolution columns are WRITABLE - 98_column_locks
//   grants UPDATE (account_id, score, status, updated_at) on signal, precisely
//   so a human or a later rule can correct a match. Only the evidence half is
//   frozen. "arda does not supply them" is a product rule enforced by this
//   adapter, not a database lock, and saying otherwise would send the next
//   reader looking for a constraint that is not there.

/** The literal that marks a signal as arda-sourced. It is also half the dedup
 * key (uidx_signal_ws_source_ref) and the whole of the kill switch's WHERE
 * clause, so it is a constant rather than a string typed twice. */
export const ARDA_SOURCE = "arda";

export interface ArdaContext {
  /** Platform-issued isolation key. s2s.ts refuses to mint a token without it. */
  workspaceId: string;
  tenantId: string;
  /** Lets an operator find this exact call in the platform's logs. */
  requestId?: string;
}

export interface ArdaFetch {
  /**
   * Ready to hand to ingestSignals. Already mapped, already validated; the
   * adapter has done the guessing so the caller does none.
   */
  signals: NewSignal[];
  /**
   * Records whose type had no mapping, or whose identity did not fit the
   * column. Counted, never coerced - see http-source.ts.
   *
   * Reported even on a green run: a feed delivering 500 records of which 12
   * map is a broken integration wearing a tick, and it is the likeliest way
   * this quietly stops earning its keep.
   */
  unmapped: number;
  /**
   * When arda says the facts are true as of. NOT when we fetched them.
   *
   * The distinction is load-bearing rather than pedantic: signal.detected_at is
   * frozen on insert, so mapping it from fetch time would permanently record
   * that something was detected at the moment a cron happened to run. There is
   * no UPDATE grant to repair it with.
   */
  asOf: Date | null;
  /** When we asked. Only ever used for logging and the overlap window. */
  fetchedAt: Date;
  /**
   * Set only if arda turns out to require a caller-held cursor.
   *
   * ADR-011's zero-DDL property depends on this staying absent: a cursor whose
   * state we must keep is a watermark table, which is an increment. It is
   * liaison question 7, and it is the single question that decides whether that
   * claim survives.
   */
  cursor?: string;
}

/**
 * The port. The job route depends on this and never on the transport.
 *
 * There is no publish, share or extract method, and its absence is the design:
 * ingestion is reversible, disclosure is not, and both platforms' retention and
 * revocation models are unpublished (liaison question 16). Stage 1 sends
 * nothing outbound at all.
 */
export interface ArdaFactSource {
  /**
   * Facts recorded at or after `since`.
   *
   * `since` is derived by the caller from what is already stored, re-polled
   * with a deliberate overlap, so no cursor has to be persisted anywhere.
   */
  fetchSignals(ctx: ArdaContext, since: Date, limit: number): Promise<ArdaFetch>;
  /** True when the plane is configured AND reachable. */
  readonly configured: boolean;
}
