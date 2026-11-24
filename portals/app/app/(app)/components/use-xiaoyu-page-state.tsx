"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { routePageContext } from "../../domains/copilot/lib/page-context";
import type { TaskObject } from "../../domains/copilot/lib/task-contract";
import { useOptionalXiaoyuClient } from "./xiaoyu-provider";
/** Bounded semantic filters/IDs, never rendered DOM or an authorization scope. */
export function useXiaoyuPageState(filters:Record<string,string>,selection:TaskObject[]=[]) {
  const client=useOptionalXiaoyuClient(),path=usePathname();
  const surface=routePageContext(path)?.surface,signature=JSON.stringify({filters,selection});
  useEffect(()=>{
    if(!surface)return;
    client?.setPageListing(surface,JSON.parse(signature));
    return ()=>client?.setPageListing(surface,null);
  },[client,surface,signature]);
}
