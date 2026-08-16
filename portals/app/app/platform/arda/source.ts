import type { ArdaContext, ArdaFactSource, ArdaFetch } from "./port";
import { HttpArdaFactSource } from "./http-source";

// Configuration and the null source.
//
// Unset config means the null source, and THAT IS A NORMAL STATE, not a stub
// and not a fault. It is the same posture Runos is already in: with the
// production catalogue empty, runos_discover returning an empty list is a
// normal return rather than a failure. A workspace with no arda feed simply has
// the manual signal inbox it had before.

type EnvLike = Record<string, string | undefined>;

export interface ArdaConfig {
  baseUrl: string;
  timeoutMs: number;
  /** How far back to re-poll past the stored watermark. Overlap is cheaper than
   * a gap: a duplicate is caught by uidx_signal_ws_source_ref and counted, a
   * missed record is invisible forever. */
  overlapHours: number;
  pageLimit: number;
  enabled: boolean;
}

export function getArdaConfig(env: EnvLike = process.env): ArdaConfig {
  const baseUrl = (env.ARDA_BASE_URL ?? "").replace(/\/$/, "");
  const num = (raw: string | undefined, fallback: number) => {
    const n = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    baseUrl,
    timeoutMs: num(env.ARDA_TIMEOUT_MS, 10_000),
    overlapHours: num(env.ARDA_SYNC_OVERLAP_HOURS, 6),
    pageLimit: num(env.ARDA_SYNC_PAGE_LIMIT, 200),
    // No default host. A data plane that guessed its own address could pull a
    // workspace's signals from somewhere nobody chose.
    enabled: baseUrl !== "",
  };
}

/** Configured-off. Returns nothing and reports it, rather than pretending. */
export class NullArdaFactSource implements ArdaFactSource {
  readonly configured = false;

  async fetchSignals(_ctx: ArdaContext, _since: Date, _limit: number): Promise<ArdaFetch> {
    return { signals: [], unmapped: 0, asOf: null, fetchedAt: new Date() };
  }
}

let memo: ArdaFactSource | null = null;

/**
 * ZERO-ARGUMENT ON PURPOSE.
 *
 * The discarded karda module had getKnowledgePlane(env) memoise on an unkeyed
 * module-level variable, so every caller after the first silently got the FIRST
 * caller's environment - and a test that passed a stub env would have been
 * served the production plane while reporting a pass. Taking no argument makes
 * that class of bug unrepresentable; tests use setArdaFactSource().
 */
export function getArdaFactSource(): ArdaFactSource {
  if (memo) return memo;
  const config = getArdaConfig();
  memo = config.enabled ? new HttpArdaFactSource(config) : new NullArdaFactSource();
  return memo;
}

/** Tests: inject a source, or pass null to forget the memo. */
export function setArdaFactSource(next: ArdaFactSource | null): void {
  memo = next;
}
