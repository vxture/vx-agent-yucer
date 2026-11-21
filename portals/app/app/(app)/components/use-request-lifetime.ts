"use client";
import { useEffect, useRef } from "react";

/** Server actions cannot be aborted in transit. Ignore their completion when
 * the keyed business surface has gone away, including Strict Mode remounts. */
export function useRequestLifetime(onDispose?: () => void) {
  const controller = useRef(new AbortController());
  const dispose = useRef(onDispose);
  dispose.current = onDispose;
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => { current.abort(); dispose.current?.(); };
  }, []);
  return controller;
}
