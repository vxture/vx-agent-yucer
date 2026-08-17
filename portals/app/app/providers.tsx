"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@vxture/design-system";
import { FullscreenProvider, ToastProvider, TooltipProvider } from "@vxture/design-ui";

/**
 * The provider stack, in a client module of our own.
 *
 * The root layout is a server component, and design-system's barrel is
 * "use client" with `export *` - a combination Next.js refuses to load across
 * a server/client boundary because it cannot enumerate the exports. Importing
 * it from here instead puts it inside the client graph, where no enumeration
 * happens. This is the standard Next.js pattern rather than a workaround; the
 * provider stack is inherently client-side anyway.
 *
 * defaultMode="light" overrides the DS default, which is "system". Following
 * the operating system would mean two people looking at the same account see
 * different screens, so a screenshot pasted into a chat is ambiguous about what
 * the other person is actually looking at. A dark toggle stays available; it is
 * the DEFAULT that is being pinned, not the choice.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultMode="light">
      <FullscreenProvider>
        <ToastProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ToastProvider>
      </FullscreenProvider>
    </ThemeProvider>
  );
}
