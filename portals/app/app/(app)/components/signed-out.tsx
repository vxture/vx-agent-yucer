"use client";
import { useEffect } from "react";
import { SIGNED_OUT_COOKIE } from "../../auth/lib/signed-out-marker";
import { EntryPanel } from "./entry-panel";
export function SignedOut({ accountHref }: { readonly accountHref: string | null }) {
  useEffect(() => { document.cookie = `${SIGNED_OUT_COOKIE}=; path=/; max-age=0; samesite=lax`; }, []);
  return <EntryPanel state="signed-out" loginHref="/auth/login" accountHref={accountHref} />;
}
