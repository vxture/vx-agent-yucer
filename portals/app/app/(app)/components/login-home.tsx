"use client";
import { EntryPanel } from "./entry-panel";
export function LoginHome({ href, resume }: { readonly href: string; readonly resume: boolean }) {
  return <EntryPanel state={resume ? "restoring" : "signin"} loginHref={href} />;
}
