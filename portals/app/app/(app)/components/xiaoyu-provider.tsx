"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { XiaoyuClient, pointerKey } from "../lib/xiaoyu-client";

const Context = createContext<XiaoyuClient | null>(null);
export function XiaoyuProvider({ workspaceId, actorSub, enabled, children }: {
  readonly workspaceId: string; readonly actorSub: string; readonly enabled: boolean; readonly children: ReactNode;
}) {
  const router=useRouter();
  const [client] = useState(() => new XiaoyuClient(
    (path, init) => fetch(path, init),
    id => { try { const key = pointerKey(workspaceId, actorSub); if (id) sessionStorage.setItem(key, id); else sessionStorage.removeItem(key); } catch { /* Storage may be disabled. URLs still work. */ } },
    {sync:async()=>{const pending:Promise<void>[]=[];window.dispatchEvent(new CustomEvent("xiaoyu:sync-forms",{detail:pending}));await Promise.all(pending);},open:href=>{window.dispatchEvent(new Event("xiaoyu:refresh-forms"));router.push(href);}},
  ));
  useEffect(() => {
    if (!enabled) return;
    let id: string | null = null;
    try { id = sessionStorage.getItem(pointerKey(workspaceId, actorSub)); } catch { /* Optional pointer only. */ }
    void client.start(id);
    const refresh = () => { if (document.visibilityState === "visible") void client.refresh(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void client.refresh(false); }, 30000);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const s = client.getSnapshot();
      if (s.notesDirty || s.input.trim()) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); window.removeEventListener("beforeunload", beforeUnload); client.suspend(); };
  }, [client, workspaceId, actorSub, enabled]);
  // React Strict Mode may replay effects. Abort rendering through the keyed
  // provider/session boundary on identity changes, never recycle another scope.
  return <Context.Provider value={enabled ? client : null}>{children}</Context.Provider>;
}
export function useXiaoyu() {
  const client = useContext(Context);
  if (!client) throw new Error("xiaoyu_not_available");
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return { client, ...state };
}
