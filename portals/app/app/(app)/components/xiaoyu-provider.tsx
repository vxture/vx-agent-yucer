"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { XiaoyuClient, pointerKey, requestedWorkspaceTask } from "../lib/xiaoyu-client";
import { routePageContext } from "../../domains/copilot/lib/page-context";

const Context = createContext<XiaoyuClient | null>(null);
export function XiaoyuProvider({ workspaceId, actorSub, enabled, children }: {
  readonly workspaceId: string; readonly actorSub: string; readonly enabled: boolean; readonly children: ReactNode;
}) {
  const router=useRouter();
  const pathname = usePathname(), search = useSearchParams().toString();
  const entryTask = useRef(requestedWorkspaceTask(pathname, search));
  const [client] = useState(() => new XiaoyuClient(
    (path, init) => fetch(path, init),
    id => { try { const key = pointerKey(workspaceId, actorSub); if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key); } catch { /* Storage may be disabled. URLs still work. */ } },
    {sync:async()=>{const pending:Promise<void>[]=[];window.dispatchEvent(new CustomEvent("xiaoyu:sync-forms",{detail:pending}));await Promise.all(pending);},open:href=>{window.dispatchEvent(new Event("xiaoyu:refresh-forms"));router.push(href);}},
  ));
  useEffect(() => {
    if (!enabled) return;
    let id: string | null = null;
    try { id = sessionStorage.getItem(pointerKey(workspaceId, actorSub)); } catch { /* Optional pointer only. */ }
    // An explicit recent-work link takes precedence over the last open task.
    void client.start(entryTask.current ?? id);
    const refresh = () => { if (document.visibilityState === "visible") void client.refresh(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void client.refresh(false); }, 30000);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const s = client.getSnapshot();
      if (s.notesDirty || s.inputDirty || s.inputSaving) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); window.removeEventListener("beforeunload", beforeUnload); client.suspend(); };
  }, [client, workspaceId, actorSub, enabled]);
  useEffect(() => { if (enabled) client.setPageContext(routePageContext(pathname, search)); }, [client, enabled, pathname, search]);
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => {
    if (!enabled || !state.bundle || !state.inputDirty || state.busy || state.loading || state.pending || client.getSnapshot().inputSaving) return;
    const timer = window.setTimeout(() => { void client.persistInput(); }, 750);
    return () => window.clearTimeout(timer);
  }, [client, enabled, state.bundle?.task.id, state.input, state.inputDirty, state.busy, state.loading, state.pending]);
  // React Strict Mode may replay effects. Abort rendering through the keyed
  // provider/session boundary on identity changes, never recycle another scope.
  return <Context.Provider value={enabled ? client : null}>{children}</Context.Provider>;
}
export function useOptionalXiaoyuClient() { return useContext(Context); }
const emptySubscribe = () => () => {};
const emptySnapshot = () => null;
export function useOptionalXiaoyu() {
  const client = useContext(Context);
  return useSyncExternalStore(client?.subscribe ?? emptySubscribe, client?.getSnapshot ?? emptySnapshot, emptySnapshot);
}
export function useXiaoyu() {
  const client = useContext(Context);
  if (!client) throw new Error("xiaoyu_not_available");
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return { client, ...state };
}
