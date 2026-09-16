import { BRAND } from "@yucer/shared/brand";
import { PRODUCT_MARK_SRC, PRODUCT_MARK_PNG_SRC } from "./(app)/lib/brand-assets";

// Split out of layout.tsx (2026-09-16) so it is importable in a plain node:test
// run: layout.tsx pulls in "./globals.css", which only a bundler can parse, so
// nothing that imports layout.tsx as a module can run under the test runner.
// This file imports nothing layout.tsx-shaped, so metadata.test.ts can assert
// its shape directly instead of relying only on a browser/curl check.

export const metadata = {
  title: BRAND.displayName,
  description: `${BRAND.displayName} - a Vxture product`,
  // The tab icon. Until 2026-09-16 this was unset - no app/favicon.ico, no
  // metadata.icons - so a browser probing /favicon.ico got a 404 and fell back
  // to its own generic tab icon; a stray, unreferenced public/favicon-products.ico
  // (an inherited template placeholder, never wired to anything) made it look
  // wired when it never was. SVG first because it renders crisp at any tab
  // size and is the one this product treats as canonical (brand-assets.ts);
  // the PNG is the fallback for a reader that cannot take an SVG favicon.
  icons: {
    icon: [{ url: PRODUCT_MARK_SRC, type: "image/svg+xml" }],
    shortcut: PRODUCT_MARK_PNG_SRC,
  },
};
