"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { DesignateAccount, type DesignateAccountProps } from "./designate-account";
import { AccountBasicsForm, type AccountBasicsFormProps } from "./account-basics-form";
import { OwnerEditor, type OwnerEditorProps } from "./owner-editor";

// The customer page's editors, reachable from more than one place (owner,
// 2026-09-23: 每个板块按需一个「⋮」, 至少查看、编辑). 客户总编辑 in the
// breadcrumb row opened these three drawers; now the org-unit and contacts
// panels' own menus open the SAME drawers - one drawer, several doors, never a
// second copy of a form. Also carries the one cross-panel request the roster
// needs: its 合同 tab's 编辑 asks the contract card to open its entry drawer.
//
// State only - the drawers render where AccountEditDrawers is placed (inside
// the centre pane), so nothing here adds a child to the shell's body row.

type Editor = "tier" | "basics" | "owner";

interface AccountEdit {
  readonly canWrite: boolean;
  readonly active: Editor | null;
  readonly focus: "contacts" | null;
  open: (which: Editor, focus?: "contacts") => void;
  close: () => void;
  /** Bumped to ask the contract card to open its 录入合同 drawer. */
  readonly contractCreateSeq: number;
  requestContractCreate: () => void;
}

const Ctx = createContext<AccountEdit | null>(null);

export function AccountEditProvider({ canWrite, children }: { readonly canWrite: boolean; readonly children: ReactNode }) {
  const [active, setActive] = useState<Editor | null>(null);
  const [focus, setFocus] = useState<"contacts" | null>(null);
  const [contractCreateSeq, setSeq] = useState(0);
  return (
    <Ctx.Provider
      value={{
        canWrite,
        active,
        focus,
        open: (which, f) => {
          setFocus(f ?? null);
          setActive(which);
        },
        close: () => setActive(null),
        contractCreateSeq,
        requestContractCreate: () => setSeq((n) => n + 1),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** Null outside the customer page - callers there simply offer no editor. */
export function useAccountEdit(): AccountEdit | null {
  return useContext(Ctx);
}

export function AccountEditDrawers({
  tier,
  basics,
  owner,
}: {
  readonly tier: Omit<DesignateAccountProps, "open" | "onOpenChange">;
  readonly basics: Omit<AccountBasicsFormProps, "open" | "onOpenChange" | "focus">;
  readonly owner: Omit<OwnerEditorProps, "open" | "onOpenChange">;
}) {
  const edit = useAccountEdit();
  if (!edit || !edit.canWrite) return null;
  const set = (which: Editor) => (o: boolean) => (o ? edit.open(which) : edit.close());
  return (
    <>
      <DesignateAccount {...tier} open={edit.active === "tier"} onOpenChange={set("tier")} />
      <AccountBasicsForm {...basics} open={edit.active === "basics"} onOpenChange={set("basics")} focus={edit.focus} />
      <OwnerEditor {...owner} open={edit.active === "owner"} onOpenChange={set("owner")} />
    </>
  );
}
