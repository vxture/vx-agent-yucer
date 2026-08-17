import type { ReactNode } from "react";
import { Providers } from "./providers";
import { BRAND } from "@yucer/shared/brand";
import "./globals.css";

// Root layout. The provider stack is the design system's prescribed one
// (ThemeProvider -> FullscreenProvider), plus ToastProvider and TooltipProvider
// so any surface can raise a notification or a tooltip without mounting its own.
// TooltipProvider in particular is not optional: a DS Tooltip throws outside it,
// and more than one domain surface uses tooltips.
//
// suppressHydrationWarning is required, not cosmetic: ThemeProvider resolves the
// theme on the client and stamps a class on <html>, so the server-rendered
// markup and the first client render legitimately differ on that one attribute.

export const metadata = {
  title: BRAND.displayName,
  description: `${BRAND.displayName} - a Vxture product`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={BRAND.defaultLocale} suppressHydrationWarning>
      <body>
        {/* The prop is defaultMode; the DS README's example still says
            defaultTheme, which its own shipped types reject. */}
        <Providers>{children}
        </Providers>
      </body>
    </html>
  );
}
