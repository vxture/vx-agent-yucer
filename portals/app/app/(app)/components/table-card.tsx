import type { ReactNode } from "react";
import { Card } from "@vxture/design-ui";

// The surface a DataTable sits on.
//
// It exists for one reason: a table with a pinned action column has to agree
// with whatever is behind it, and a bare Card does not.
//
// DataTable's sticky column paints an OPAQUE mask so the business columns pass
// underneath it during horizontal scroll instead of showing through. The colour
// it masks with is `var(--vx-table-sticky-bg, var(--background))` - the page
// canvas by default. Card, meanwhile, has no background colour at all: it is a
// translucent gradient veil over whatever is behind it. On this product the
// canvas is the workbench tint #f4f7fd, so the action column rendered as a
// visibly bluer stripe against the near-white veil beside it.
//
// Two halves to the fix, and both are needed:
//
//   bg-card       gives the veil an opaque base, so the card's own surface is
//                 flat white rather than 66% white over the canvas.
//   the variable  points the mask at that same token instead of the canvas.
//
// The variable is the DS's own hook - the class is written
// `bg-[var(--vx-table-sticky-bg,var(--background))]` precisely so a consumer
// can redirect it - so this is the sanctioned way rather than an override. It
// carries no literal value: one DS token wired into a DS-provided slot.

export function TableCard({ children }: { readonly children: ReactNode }) {
  return (
    <Card
      className="bg-card p-xs"
      style={{ "--vx-table-sticky-bg": "var(--card)" } as React.CSSProperties}
    >
      {children}
    </Card>
  );
}
