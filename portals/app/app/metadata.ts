import type { Locale } from "@vxture/shared";
import { getDictionary } from "./(app)/lib/i18n/dictionary";
import { PRODUCT_MARK_SRC, PRODUCT_MARK_PNG_SRC } from "./(app)/lib/brand-assets";

// Split out of layout.tsx (2026-09-16) so it is importable in a plain node:test
// run: layout.tsx pulls in "./globals.css", which only a bundler can parse, so
// nothing that imports layout.tsx as a module can run under the test runner.
// This file imports nothing layout.tsx-shaped (getDictionary is a pure lookup,
// no next/headers), so metadata.test.ts can assert its shape directly instead
// of relying only on a browser/curl check.

// THE TAB TITLE IS THE BRAND'S OWN SPOKEN NAME (SHELL_TEXT.brandName), NOT
// BRAND.displayName (2026-09-16). This shipped once reading BRAND.displayName
// ("Yucer") - the internal, package-scope constant - while the page's own
// header renders SHELL_TEXT.brandName ("禹策销售智能体" / "Yucer Sales
// Agent"), so the tab said something the product never says about itself
// anywhere a reader can see. Locale-aware for the same reason `lang` on
// <html> is (layout.tsx's own comment): a Chinese reader's tab should not say
// an English name a French/English reader would get in Chinese order. A
// static `metadata` export cannot read the per-request locale cookie -
// layout.tsx calls this from `generateMetadata()` instead, which can.
export function buildMetadata(locale: Locale) {
  const { brandName } = getDictionary(locale).SHELL_TEXT;
  return {
    title: brandName,
    description: `${brandName} - a Vxture product`,
    // The tab icon. Until 2026-09-16 this was unset - no app/favicon.ico, no
    // metadata.icons - so a browser probing /favicon.ico got a 404 and fell
    // back to its own generic tab icon; a stray, unreferenced
    // public/favicon-products.ico (an inherited template placeholder, never
    // wired to anything) made it look wired when it never was. SVG first
    // because it renders crisp at any tab size and is the one this product
    // treats as canonical (brand-assets.ts); the PNG is the fallback for a
    // reader that cannot take an SVG favicon.
    icons: {
      icon: [{ url: PRODUCT_MARK_SRC, type: "image/svg+xml" }],
      shortcut: PRODUCT_MARK_PNG_SRC,
    },
  };
}
