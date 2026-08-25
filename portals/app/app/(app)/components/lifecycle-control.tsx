"use client";

import { useTransition } from "react";
import { ActionMenu, useToast } from "@vxture/design-ui";
import { LIFECYCLE_ERROR, LIFECYCLE_TEXT } from "../lib/messages";

// Moving a plan or a campaign through its lifecycle.
//
// The choices come from the state machine's own transition map, so the menu
// offers exactly the legal moves. A control that listed every status and let the
// machine refuse four of five would teach people the product says no for reasons
// they cannot predict - and it is the map, not the surface, that knows.
//
// A terminal record renders nothing at all rather than a disabled control: there
// is no move to make, and a greyed-out one invites hunting for the one that
// works.
//
// A MENU, NOT A PICKER PLUS A BUTTON. This was a NativeSelect followed by an
// Apply button, which made every move two steps - choose the destination, then
// confirm it - and the confirm step decided nothing, because choosing the
// destination WAS the decision. In a menu the destination is the action: one
// click to open, one to move. It is also the shape a row-action column can
// hold, which a dropdown and a button never could.
//
// FAILURES GO TO A TOAST. The refusal used to render as a badge beside the
// control, which is impossible in a column fixed at 56px - and the reason is
// better than the constraint anyway: a violation is an event, not a property of
// the row, so it belongs somewhere that can hold a sentence and then leave.

export interface LifecycleControlProps {
  readonly id: string;
  readonly status: string;
  /** The legal next states, from the domain's transition map. */
  readonly options: readonly string[];
  readonly label: Record<string, string>;
  readonly canChange: boolean;
  readonly onChange: (id: string, to: string) => Promise<{ ok: boolean; error?: string }>;
}

export function LifecycleControl({
  id,
  options,
  label,
  canChange,
  onChange,
}: LifecycleControlProps) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  if (!canChange || options.length === 0) return null;

  return (
    <ActionMenu
      label={LIFECYCLE_TEXT.moveTo}
      disabled={pending}
      items={options.map((to) => ({
        id: to,
        label: label[to] ?? to,
        onSelect: () =>
          startTransition(() => {
            void onChange(id, to).then((r) => {
              if (r.ok) return;
              // The violation code, mapped to a sentence. "Finish or skip the
              // outstanding executions" is actionable; "failed" is not.
              toast({
                tone: "danger",
                title: LIFECYCLE_ERROR[r.error ?? "denied"] ?? r.error ?? "denied",
              });
            });
          }),
      }))}
    />
  );
}
