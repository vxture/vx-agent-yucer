"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { sameSessionIdentity, type SessionIdentity } from "../lib/session-identity";
import { SessionUnavailable, SessionUpdating } from "./session-unavailable";
import { SignIn } from "./sign-in";

/** Lives OUTSIDE the shell and assistant: invalidation unmounts every protected
 * subtree, including pending client requests. A hard reload on account change
 * also discards Next's previous-user router cache. */
export function SessionBoundary({ identity, enabled, children }: {
  readonly identity: SessionIdentity;
  readonly enabled: boolean;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<"ready" | "ended" | "unavailable" | "reloading">("ready");
  const stateRef = useRef(state);
  const show = useCallback((next: "ready" | "ended" | "unavailable" | "reloading") => {
    stateRef.current = next;
    setState(next);
  }, []);
  const inFlight = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const check = useCallback(async (force: boolean, syncContext = false) => {
    if (inFlight.current && !force) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const request = ++sequence.current;
    try {
      const response = await fetch(`/auth/session${force && !syncContext ? "?force=1" : ""}`, {
        method: syncContext ? "POST" : "GET",
        cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      const body = await response.json();
      if (request !== sequence.current) return;
      if (!response.ok || body.authenticated === null) { show("unavailable"); return; }
      if (body.authenticated === false) { show("ended"); return; }
      if (body.authenticated !== true || !body.user?.sub) { show("unavailable"); return; }
      if (!sameSessionIdentity(identity, body.user)) {
        show("reloading");
        window.location.reload();
        return;
      }
      // Recovery remounts from a new server render, never old cached children.
      if (stateRef.current !== "ready") window.location.reload();
    } catch {
      if (!controller.signal.aborted && request === sequence.current) show("unavailable");
    } finally {
      if (request === sequence.current) inFlight.current = null;
    }
  }, [identity, show]);

  useEffect(() => {
    if (!enabled) return;
    void check(true);
    // Browsers often emit focus and visibilitychange for the same return.
    // Coalesce that burst, while keeping the scheduled GET read-only.
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
      window.clearInterval(timer);
      clearTimeout(foregroundTimer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", pageShow);
      document.removeEventListener("visibilitychange", sync);
      sequence.current++;
      inFlight.current?.abort();
    };
  }, [check, enabled, pathname]);

  if (state === "reloading") return <SessionUpdating />;
  if (state === "ended") return <SignIn resume />;
  if (state === "unavailable") return <SessionUnavailable retry={() => void check(true, true)} />;
  return children;
}
