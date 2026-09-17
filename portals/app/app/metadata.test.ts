import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMetadata } from "./metadata";
import { PRODUCT_MARK_SRC, PRODUCT_MARK_PNG_SRC } from "./(app)/lib/brand-assets";

// Until 2026-09-16 the root layout declared no `icons` at all - no
// app/favicon.ico, no metadata.icons - so a browser's automatic GET
// /favicon.ico 404ed and the tab fell back to the browser's own generic icon.
// `brand-assets.test.ts` guards the mark FILES (single source of the path,
// PNG decodes correctly); this guards that the metadata actually WIRES one of
// them as the favicon, which neither of those checks - reverting just the
// `icons` field leaves both of them green. Split into its own module (rather
// than tested via layout.tsx directly) because layout.tsx imports
// "./globals.css", which only a bundler can parse - nothing that imports it
// as a plain module can run under node:test.
//
// THE FIRST VERSION OF THIS TEST asserted the title against BRAND.displayName
// ("Yucer") - which is exactly the bug: the tab said "Yucer" while the page's
// own header says SHELL_TEXT.brandName ("聿策销售智能体" / "Yucer Sales
// Agent"). Asserting against the wrong reference let a real mismatch ship
// green. Assert against the dictionary instead, in both locales.

test("the tab title is the brand's own spoken name (SHELL_TEXT.brandName), locale-aware", () => {
  assert.equal(buildMetadata("zh-CN").title, "聿策销售智能体");
  assert.equal(buildMetadata("en-US").title, "Yucer Sales Agent");
});

test("the favicon is the product mark, svg primary with a png fallback", () => {
  const icons = buildMetadata("zh-CN").icons as { icon: { url: string; type: string }[]; shortcut: string };
  assert.equal(icons.icon[0]?.url, PRODUCT_MARK_SRC);
  assert.equal(icons.icon[0]?.type, "image/svg+xml");
  assert.equal(icons.shortcut, PRODUCT_MARK_PNG_SRC);
});
