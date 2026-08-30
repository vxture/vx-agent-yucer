// Connection-layer probes for the status surface, extracted from the route so
// the logic is pinnable without Next's request machinery around it.

export const PROBE_TIMEOUT_MS = 1000;

// The loser of the race still has to be cleaned up. Without the clear, a probe
// that answers quickly leaves its timer armed for the full budget, so a polled
// status page accumulates one pending timer per probe per request.
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((r) => {
      timer = setTimeout(() => r(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Reachability at the CONNECTION layer, which is the question a connectivity
 * check actually asks. Any HTTP response - 404 and 405 included - proves the
 * service answered on that address; only a connect failure or the timeout says
 * unreachable. The three planes are tailnet-internal, so the browser cannot
 * probe them itself the way the client-side channel probes do.
 */
export async function probeHttp(
  base: string | null | undefined,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<boolean | null> {
  if (!base) return null;
  return withTimeout(
    (async () => {
      try {
        await fetch(base, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
        return true;
      } catch {
        return false;
      }
    })(),
    timeoutMs + 200,
    false,
  );
}
