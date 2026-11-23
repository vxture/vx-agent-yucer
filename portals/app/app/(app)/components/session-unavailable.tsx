"use client";
import { EntryPanel } from "./entry-panel";
export function SessionUnavailable({ retry, preserveWork = false }: { readonly retry: () => void | Promise<void>; readonly preserveWork?: boolean }) {
  const loginHref = typeof window === "undefined" ? "/auth/login" : `/auth/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  return <EntryPanel state={preserveWork ? "recovery" : "unavailable"} retry={retry} preserveWork={preserveWork} loginHref={preserveWork ? loginHref : undefined} />;
}
export function SessionUnavailableReload() {
  return <SessionUnavailable retry={() => window.location.reload()} />;
}
export function SessionUpdating() { return <EntryPanel state="checking" />; }
