import { mintS2SToken, type FetchLike, type S2SToken } from "../s2s";
import { SIGNAL_TYPES, type SignalType } from "../../domains/signal/lib/scoring";
import type { NewSignal } from "../../domains/signal/store";
import { ARDA_SOURCE, type ArdaContext, type ArdaFactSource, type ArdaFetch } from "./port";
import type { ArdaConfig } from "./source";

// THE ONLY QUARANTINED GUESS IN THIS INTEGRATION.
//
// arda has published no contract to this repo, so the path, the query
// parameters and every field name read below are yucer's best reading and WILL
// change. That is survivable because it is confined here: the port returns
// yucer's own NewSignal, so a published contract rewrites this file and nothing
// else. The open questions are numbered in
// docs/80-liaison/01-2608161131-platform-karda-arda-contract-request.md.
//
// Three rules govern the mapping, and all three exist because signal's evidence
// columns are FROZEN ON INSERT - there is no UPDATE grant, so a wrong value is
// repairable only by a db-init data correction.
//
//   1. NEVER COERCE AN UNMAPPED TYPE. A record whose taxonomy value has no
//      mapping is counted and dropped. Falling back to 'other' would
//      manufacture frozen evidence of a type nobody chose, and 'other' scores
//      differently, so the fabrication would propagate into ranking.
//   2. NEVER TRUNCATE. An over-length identity is dropped, not cut to fit.
//      Truncation is worse than dropping: two distinct records can collapse to
//      one source_ref, and uidx_signal_ws_source_ref then makes the second
//      permanently invisible while reporting it as a healthy duplicate.
//   3. detected_at COMES FROM ARDA'S TRUE-AS-OF, NEVER FROM FETCH TIME.
//      Otherwise every record permanently claims it was detected at the moment
//      a cron happened to run.
//
// The deps object mirrors the atlas/runos clients. The discarded karda client
// invented a third call shape and passed three positional arguments to a
// two-parameter mintS2SToken - which is exactly why it never compiled, and why
// a test injecting a stub fetch would have reached the real IdP and then passed
// for the wrong reason.

export interface ArdaDeps {
  fetchImpl?: FetchLike;
  mintToken?: (ctx: ArdaContext) => Promise<S2SToken>;
}

/** signal.source_ref is VARCHAR(255) and is half the dedup key. */
const MAX_SOURCE_REF = 255;
/** signal.subject is VARCHAR(512). */
const MAX_SUBJECT = 512;

/**
 * Provisional. Every key here is a guess (liaison question 9), and the map is
 * deliberately explicit rather than a fuzzy match: a taxonomy that grows a
 * value we have not seen must show up as `unmapped`, not as a near-miss.
 */
const TYPE_MAP: Readonly<Record<string, SignalType>> = {
  intent: "intent",
  hiring: "hiring",
  funding: "funding",
  tech_change: "tech_change",
  engagement: "engagement",
  referral: "referral",
};

export class HttpArdaFactSource implements ArdaFactSource {
  readonly configured = true;

  constructor(
    private readonly config: ArdaConfig,
    private readonly deps: ArdaDeps = {},
  ) {}

  async fetchSignals(ctx: ArdaContext, since: Date, limit: number): Promise<ArdaFetch> {
    const fetchImpl = this.deps.fetchImpl ?? (globalThis.fetch as FetchLike);
    const fetchedAt = new Date();

    const token = await (this.deps.mintToken
      ? this.deps.mintToken(ctx)
      : mintS2SToken(
          {
            audience: "arda",
            // No end user is behind a scheduled sync, so there is nobody to act
            // on behalf of. An obo token here would attribute the pull to
            // whoever last signed in.
            mode: "service",
            workspaceId: ctx.workspaceId,
            tenantId: ctx.tenantId,
          },
          { fetchImpl },
        ));

    const url =
      `${this.config.baseUrl}/v1/facts` +
      `?since=${encodeURIComponent(since.toISOString())}&limit=${limit}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let body: unknown;
    try {
      // GET only. Stage 1 sends nothing outbound, and the test asserts the
      // injected fetch never sees another method - a structural guard against
      // stage 2 arriving one small improvement at a time.
      const res = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token.accessToken}`,
          ...(ctx.requestId ? { "x-request-id": ctx.requestId } : {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`arda fetch failed (${res.status})`);
      }
      body = await res.json();
    } finally {
      clearTimeout(timer);
    }

    return this.map(body, fetchedAt);
  }

  /** Separated from the request so the mapping rules are testable without a
   * transport, which is where their entire value is. */
  map(body: unknown, fetchedAt: Date): ArdaFetch {
    const root = (body ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(root.facts) ? (root.facts as Record<string, unknown>[]) : [];

    const signals: NewSignal[] = [];
    let unmapped = 0;
    let asOf: Date | null = parseDate(root.asOf);

    for (const r of rows) {
      const signalType = TYPE_MAP[String(r.factType ?? "")];
      // Rule 1. Counted, never coerced.
      if (!signalType) {
        unmapped += 1;
        continue;
      }

      const sourceRef = typeof r.id === "string" ? r.id : "";
      const subject = typeof r.subject === "string" ? r.subject.trim() : "";
      // Rule 2. Dropped, never cut to fit.
      if (!sourceRef || sourceRef.length > MAX_SOURCE_REF || !subject || subject.length > MAX_SUBJECT) {
        unmapped += 1;
        continue;
      }

      // Rule 3. True-as-of, never fetch time. A record that cannot say when it
      // was true is not evidence, so it is dropped rather than stamped now.
      const detectedAt = parseDate(r.observedAt);
      if (!detectedAt) {
        unmapped += 1;
        continue;
      }
      if (asOf === null || detectedAt.getTime() > asOf.getTime()) asOf = detectedAt;

      signals.push({
        source: ARDA_SOURCE,
        sourceRef,
        signalType,
        subject,
        payload: isRecord(r.payload) ? r.payload : {},
        detectedAt,
        // accountId is deliberately absent. Resolution is yucer's half of the
        // table and arda never supplies it - a feed that could name the account
        // could rewrite attribution, and account_id is frozen too.
      });
    }

    const cursor = typeof root.cursor === "string" ? root.cursor : undefined;
    return { signals, unmapped, asOf, fetchedAt, ...(cursor ? { cursor } : {}) };
  }
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Exported for the test that pins the mapping table against the DDL CHECK. */
export const ARDA_TYPE_MAP = TYPE_MAP;
export const ARDA_SIGNAL_TYPES = SIGNAL_TYPES;
