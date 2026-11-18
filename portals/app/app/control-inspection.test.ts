import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectPageControls, pageHeaderControlIssues } from "../../../scripts/qa/control-inspection.mjs";

const primary = { actionSlot: "primary", isButton: true, primary: true, variant: "default", opensMenu: false, iconWidth: 16 };
const secondary = { ...primary, actionSlot: "secondary", primary: false, variant: "outline" };
const more = { ...secondary, actionSlot: "more", variant: "ghost", opensMenu: true, iconWidth: 20 };

test("page header audit accepts the primary, secondary and overflow styles", () => {
  for (const valid of [primary, secondary, more]) assert.deepEqual(pageHeaderControlIssues(valid), []);
});

test("the audit rejects a wrongly styled or wrongly emphasized page action", () => {
  assert.deepEqual(pageHeaderControlIssues({ ...primary, variant: "outline" }), ["page-primary-style"]);
  assert.deepEqual(pageHeaderControlIssues({ ...primary, primary: false }), ["page-primary-style"]);
  assert.deepEqual(pageHeaderControlIssues({ ...secondary, variant: "secondary" }), ["page-secondary-style"]);
  assert.deepEqual(pageHeaderControlIssues({ ...secondary, primary: true }), ["page-secondary-style"]);
});

test("only a page overflow trigger needs the 20px icon", () => {
  assert.deepEqual(pageHeaderControlIssues({ ...more, iconWidth: 16 }), ["page-more-icon"]);
  assert.deepEqual(pageHeaderControlIssues({ ...more, iconWidth: 0 }), ["page-more-icon"]);
  assert.deepEqual(pageHeaderControlIssues({ ...more, opensMenu: false, iconWidth: 16 }), []);
  assert.deepEqual(pageHeaderControlIssues({ ...more, actionSlot: undefined, iconWidth: 16 }), []);
  assert.deepEqual(pageHeaderControlIssues({ ...secondary, isButton: false, variant: undefined }), []);
});

test("the browser inspector applies the shared rule to measured header controls", () => {
  const makeControl = (variant: string) => ({
    dataset: { slot: "button", size: "xl", variant },
    type: "button", textContent: "Create",
    getBoundingClientRect: () => ({ width: 100, height: 32 }),
    getAttribute: () => null,
    closest: (selector: string) => selector === "[data-page-action-slot]" ? { dataset: { pageActionSlot: "primary" } } : null,
    matches: () => false,
    querySelectorAll: () => [],
    querySelector: () => null,
  });
  for (const variant of ["default", "outline"]) {
    const control = makeControl(variant);
    const globals = {
      document: {
        title: "Business", body: { innerText: "Business" },
        querySelectorAll: (selector: string) => selector.startsWith('button:not') || selector === 'a[href]' ? [] : [control],
      },
      location: { href: "http://localhost/example", origin: "http://localhost" },
      getComputedStyle: () => ({ visibility: "visible", display: "block", fontSize: variant === "default" ? "14px" : "12px" }),
    };
    const descriptors = Object.getOwnPropertyDescriptors(globalThis);
    try {
      for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
      const result = inspectPageControls();
      assert.equal(result.controls.length, 1);
      assert.equal(result.violations.length, variant === "default" ? 0 : 1);
      assert.equal(result.controls[0].actionSlot, "primary");
      assert.equal(result.controls[0].issues.includes("page-primary-style"), variant !== "default");
    } finally {
      for (const key of Object.keys(globals)) {
        if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key]);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  }
});
