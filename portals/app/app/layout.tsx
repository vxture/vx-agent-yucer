import type { ReactNode } from "react";
import { DEFAULT_LOCALE } from "@vxture/shared";
import { Providers } from "./providers";
import { resolveLocale } from "./(app)/lib/i18n/locale";
import { buildMetadata } from "./metadata";
import "./globals.css";

// STATIC on purpose, at DEFAULT_LOCALE (2026-09-16) - not generateMetadata().
// The (app) route group's own layout.tsx overrides this per-request with the
// visitor's real locale; it can afford to, because that layout already reads
// cookies() for the session and is unconditionally dynamic regardless. This
// root layout also wraps the (demo) route group's explicitly `force-static`
// preview pages, and a PARENT layout's generateMetadata calling a dynamic API
// (resolveLocale -> cookies()) forces every child segment dynamic too, no
// matter what that child declares - it silently broke `/gate-screens` and
// `/product-preview` back to server-rendered-per-request the one time this
// lived here. This static fallback only actually reaches a visitor on a
// route with no more specific layout - the (demo) pages - so its own request
// never carries a locale to read.
export const metadata = buildMetadata(DEFAULT_LOCALE);

// Root layout. The provider stack is the design system's prescribed one
// (ThemeProvider -> FullscreenProvider), plus ToastProvider and TooltipProvider
// so any surface can raise a notification or a tooltip without mounting its own.
// TooltipProvider in particular is not optional: a DS Tooltip throws outside it,
// and more than one domain surface uses tooltips.
//
// suppressHydrationWarning is required, not cosmetic: ThemeProvider resolves the
// theme on the client and stamps a class on <html>, so the server-rendered
// markup and the first client render legitimately differ on that one attribute.
//
// `lang` IS THE RESOLVED LOCALE, not the brand's default (2026-09-15). It read
// BRAND.defaultLocale, so every page declared itself Chinese however it was
// actually rendered: an English reader got English text inside lang="zh-CN",
// which is what a screen reader picks its voice from and what a browser's
// translate prompt reads. Found while checking the gate screens in English.
// resolveLocale() is the same request-scoped resolution every other surface
// uses, and next/headers caches it per render.

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await resolveLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        {/* The prop is defaultMode; the DS README's example still says
            defaultTheme, which its own shipped types reject. */}
        <Providers>{children}
        </Providers>
      </body>
    </html>
  );
}
