"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { ProductEntryState } from "../../auth/product-access";
import { type SessionIdentity } from "../lib/session-identity";
import { sessionProbeDecision } from "../lib/session-probe";
import { SignIn } from "./sign-in";
import { SessionUnavailable, SessionUpdating } from "./session-unavailable";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

type BoundaryState = "ready" | "ended" | "unavailable" | "reloading";

/** Unknown authority suspends the same work surface. A confirmed scope/access
 * change discards it and the router cache. Never replay an interrupted write. */
export function SessionBoundary({ identity, enabled, initialAccess = "ready", accessRevision, children }: {
  readonly identity: SessionIdentity;
  readonly enabled: boolean;
  readonly initialAccess?: ProductEntryState;
  readonly accessRevision?: string;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<BoundaryState>("ready");
  const stateRef = useRef(state);
  const generation = useRef(0);
  const show = useCallback((next: BoundaryState) => {
    if (stateRef.current !== next) generation.current++;
    stateRef.current = next;
    setState(next);
  }, []);
  const inFlight = useRef<Promise<void> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const check = useCallback((force: boolean, syncContext = false): Promise<void> => {
    // A retry is the same pending operation, not a second authority request.
    if (inFlight.current) return inFlight.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const request = ++sequence.current;
    const operation = (async () => {
      try {
        const response = await fetch(`/auth/session${force ? "?force=1" : ""}`, {
          method: syncContext ? "POST" : "GET",
          cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
        });
        const body = await response.json();
        if (request !== sequence.current) return;
        const decision = sessionProbeDecision(identity, initialAccess, accessRevision, body, response.ok);
        show(decision);
        if (decision === "reloading") window.location.reload();
      } catch {
        if (!controller.signal.aborted && request === sequence.current) show("unavailable");
      } finally {
        if (request === sequence.current) { inFlight.current = null; controllerRef.current = null; }
      }
    })();
    inFlight.current = operation;
    return operation;
  }, [accessRevision, identity, initialAccess, show]);

  useEffect(() => {
    if (!enabled) return;
    // Scope-stale responses cannot update a suspended surface. This guard is
    // additional UX protection; every server request checks platform assignment.
    const nativeFetch = window.fetch.bind(window);
    const refused = () => new Response(JSON.stringify({ code: "SESSION_CONFIRMATION_REQUIRED" }), { status: 503, headers: { "Content-Type": "application/json" } });
    const guardedFetch: typeof fetch = async (input, init) => {
      const url = new URL(requestUrl(input), window.location.href);
      const protectedRequest = url.origin === window.location.origin && !url.pathname.startsWith("/auth/") && !url.pathname.startsWith("/_next/");
      const revision = generation.current;
      if (protectedRequest && (stateRef.current !== "ready" || initialAccess !== "ready")) return refused();
      const response = await nativeFetch(input, init);
      if (protectedRequest && revision !== generation.current) return refused();
      if (protectedRequest && response.status === 401) void check(true);
      return response;
    };
    window.fetch = guardedFetch;
    void check(true);
    let foregroundTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(foregroundTimer);
      if (document.visibilityState === "visible") foregroundTimer = setTimeout(() => void check(true, true), 100);
    };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) sync(); };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void check(false); }, 15000);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", pageShow);
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (window.fetch === guardedFetch) window.fetch = nativeFetch;
      window.clearInterval(timer); clearTimeout(foregroundTimer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", pageShow);
      document.removeEventListener("visibilitychange", sync);
      sequence.current++; inFlight.current = null; controllerRef.current?.abort();
    };
  }, [check, enabled, initialAccess, pathname]);

  if (state === "reloading") return <SessionUpdating />;
  if (state === "ended" && initialAccess !== "ready") return <SignIn />;
  const suspended = state !== "ready";
  return <>
    <div style={{ display: suspended ? "none" : "contents" }} aria-hidden={suspended || undefined} inert={suspended || undefined}>{children}</div>
    {suspended && <SessionUnavailable preserveWork={initialAccess === "ready"} retry={() => check(true, true)} />}
  </>;
}
