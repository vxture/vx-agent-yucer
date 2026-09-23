"use client";

import { createContext, useContext, type ReactNode } from "react";

// WHO, BY NAME, EVERYWHERE (polish, 2026-09-24). A sweep of 27 pages found a
// raw member sub (usr_demo_m010) printed in owner columns, owner filters and
// timelines on twelve of them - each page had been left to resolve names on
// its own, and most never did. The app layout reads the workspace's member
// directory once and hands it down; any component asks here.
//
// A sub the directory does not know stays the sub: a departed member's rows
// still say whose they were, and inventing "unknown" would lose that.

const MemberNamesContext = createContext<Readonly<Record<string, string>>>({});

export function MemberNamesProvider({
  names,
  children,
}: {
  readonly names: Readonly<Record<string, string>>;
  readonly children: ReactNode;
}) {
  return <MemberNamesContext.Provider value={names}>{children}</MemberNamesContext.Provider>;
}

/** sub -> display name, falling back to the sub itself. */
export function useMemberName(): (sub: string | null | undefined) => string | null {
  const names = useContext(MemberNamesContext);
  return (sub) => (sub ? (names[sub] ?? sub) : null);
}

export function MemberName({ sub, fallback = "-" }: { readonly sub: string | null | undefined; readonly fallback?: string }) {
  const nameOf = useMemberName();
  return <>{nameOf(sub) ?? fallback}</>;
}
