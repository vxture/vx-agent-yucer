"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The deal page's editors, each reachable from more than one place - the
// customer page's pattern (account-edit-context.tsx; owner, 2026-09-23: 每个
// 板块按需一个「⋮」, 至少查看、编辑). The crumbs row's "⋮" and each panel's own
// "⋮" open the SAME dialog or drawer: one form, several doors.
//
// State only. Each editor is its own component that reads this context and
// renders where the page places it (inside the centre pane), so the server
// action bound to it stays paired with the one error dictionary that
// component renders (reachable-codes.test.ts pairs at the binding site).

export type DealEditor = "terms" | "roles" | "stage" | "importance";

interface DealEdit {
  readonly can: Readonly<Record<DealEditor, boolean>>;
  readonly active: DealEditor | null;
  open: (which: DealEditor) => void;
  close: () => void;
}

const Ctx = createContext<DealEdit | null>(null);

export function DealEditProvider({
  can,
  children,
}: {
  readonly can: Readonly<Record<DealEditor, boolean>>;
  readonly children: ReactNode;
}) {
  const [active, setActive] = useState<DealEditor | null>(null);
  return (
    <Ctx.Provider value={{ can, active, open: setActive, close: () => setActive(null) }}>
      {children}
    </Ctx.Provider>
  );
}

/** Null outside the deal page - callers there simply offer no editor. */
export function useDealEdit(): DealEdit | null {
  return useContext(Ctx);
}

/** open / onOpenChange for one editor, for a component that hosts it. */
export function useDealEditor(which: DealEditor): { open: boolean; onOpenChange: (o: boolean) => void } {
  const edit = useDealEdit();
  return {
    open: edit?.active === which,
    onOpenChange: (o) => (o ? edit?.open(which) : edit?.close()),
  };
}
