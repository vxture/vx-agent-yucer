"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@vxture/design-ui";
import { FOOTPRINT_KINDS, type Footprint } from "../../domains/account/lib/footprint";
import { useMessages } from "../lib/i18n/provider";
import { ConfirmDestructive } from "./confirm-destructive";

// 删除客户's confirmation, shared by the customer page's panel menu and the
// customer list's row menu. It lived inside the panel, so the list - where a
// person first looks for a delete - had none (owner, 2026-10-02).
//
// The conditions are READ when it opens, not on every render of the page: null
// while they load (every condition "unknown"), then counts. A customer with
// records on it is history and the dialog says which records, rather than
// offering a button the server will refuse.

export interface AccountDeleteProps {
  readonly onFootprint: (id: string) => Promise<{ ok: true; footprint: Footprint } | { ok: false; error: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function AccountDeleteDialog({
  accountId,
  name,
  open,
  onOpenChange,
  onFootprint,
  onDelete,
  afterDelete,
}: AccountDeleteProps & {
  readonly accountId: string;
  readonly name: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Where to go once it is gone; the list refreshes in place. */
  readonly afterDelete?: string;
}) {
  const { ACCOUNT_DELETE_TEXT, ACCOUNT_ERROR } = useMessages();
  const router = useRouter();
  const { toast } = useToast();
  const [footprint, setFootprint] = useState<Footprint | null>(null);

  useEffect(() => {
    if (!open) return;
    setFootprint(null);
    void onFootprint(accountId).then((r) => {
      if (r.ok) setFootprint(r.footprint);
    });
    // The two callbacks are server actions: stable for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountId]);

  if (!open) return null;
  return (
    <ConfirmDestructive
      open={open}
      onOpenChange={onOpenChange}
      verb={ACCOUNT_DELETE_TEXT.verb}
      titleTemplate={ACCOUNT_DELETE_TEXT.titleTemplate}
      target={name}
      consequence={ACCOUNT_DELETE_TEXT.consequence}
      preconditions={FOOTPRINT_KINDS.map((k) => ({
        label: ACCOUNT_DELETE_TEXT.condition[k],
        met: footprint !== null && footprint[k] === 0,
        unknown: footprint === null,
        note:
          footprint === null
            ? ACCOUNT_DELETE_TEXT.checking
            : footprint[k] > 0
              ? ACCOUNT_DELETE_TEXT.present(footprint[k])
              : undefined,
      }))}
      onConfirm={async () => {
        const r = await onDelete(accountId);
        if (!r.ok) {
          toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? ACCOUNT_ERROR.denied ?? "" });
          return;
        }
        toast({ tone: "success", title: ACCOUNT_DELETE_TEXT.done });
        if (afterDelete) router.push(afterDelete);
        else router.refresh();
      }}
    />
  );
}
