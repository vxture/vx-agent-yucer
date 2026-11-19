"use client";

import { createContext, useContext, type ReactNode } from "react";
import { UserAvatar } from "@vxture/design-ui";

export interface MemberIdentity {
  readonly sub: string;
  readonly name: string;
  readonly picture?: string | null;
  readonly active?: boolean;
}

const MemberNamesContext = createContext<Readonly<Record<string, string>>>({});
const MemberDirectoryContext = createContext<readonly MemberIdentity[]>([]);

export function MemberNamesProvider({ names, members = [], children }: {
  readonly names: Readonly<Record<string, string>>;
  readonly members?: readonly MemberIdentity[];
  readonly children: ReactNode;
}) {
  return <MemberNamesContext.Provider value={names}>
    <MemberDirectoryContext.Provider value={members}>{children}</MemberDirectoryContext.Provider>
  </MemberNamesContext.Provider>;
}

export function useMemberDirectory() { return useContext(MemberDirectoryContext); }

/** Text only for searching, accessible labels and exported data. */
export function useMemberName(): (sub: string | null | undefined) => string | null {
  const names = useContext(MemberNamesContext);
  return sub => sub ? names[sub] ?? sub : null;
}

/** Avatar and display name form one unbroken inline identity. */
export function MemberName({ sub, name, picture, fallback = "-" }: {
  readonly sub?: string | null;
  readonly name?: string | null;
  readonly picture?: string | null;
  readonly fallback?: string;
}) {
  const nameOf = useMemberName();
  const members = useMemberDirectory();
  const person = sub ? members.find(m => m.sub === sub) : undefined;
  const label = name || nameOf(sub);
  if (!label) return <>{fallback}</>;
  return <span className="inline-flex h-[1lh] max-w-full min-w-0 items-center gap-2xs whitespace-nowrap px-2xs align-bottom" data-member-identity>
    <UserAvatar src={picture ?? person?.picture} alt="" aria-hidden="true" className="size-[1lh] shrink-0 text-muted-foreground"/>
    <span className="min-w-0 truncate" title={label}>{label}</span>
  </span>;
}
