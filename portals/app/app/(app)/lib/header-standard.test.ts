import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PAGE_BRIEF } from "./messages";
import { en as enMessages } from "./messages.en";

// The page header is 4 + 1 (owner, 2026-10-02): icon, title, one short line,
// the tags after the title - and, on demand, ONE button bottom-right. No rule
// under it and no fold: what used to fold was a statistic (it lives in the
// page's own analysis block) or a duplicate of one.

const APP = join(import.meta.dirname, "..");
const read = (...p: string[]) => readFileSync(join(APP, ...p), "utf8");

function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

test("ModuleHeadline has no fold and no rule", () => {
  const src = read("components", "module-headline.tsx");
  assert.ok(!/Collapsible/.test(src), "the header folds again");
  assert.ok(!/useState/.test(src), "the header holds state again");
  assert.match(src, /divider=\{false\}/);
  // It reads useMessages(); without this every module page answers 500.
  assert.ok(src.startsWith('"use client"'), "ModuleHeadline lost its use-client directive");
});

test("no page hands ModuleHeadline stats, a divider or its own prose", () => {
  for (const file of pages(APP)) {
    const src = readFileSync(file, "utf8");
    const at = src.indexOf("<ModuleHeadline");
    if (at < 0) continue;
    let depth = 0;
    let end = at;
    for (; end < src.length; end++) {
      const c = src[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === "/" && src[end + 1] === ">" && depth === 0) break;
    }
    const block = src.slice(at, end);
    for (const prop of ["stats=", "share", "emptyNote=", "divider="]) {
      assert.ok(!block.includes(prop), `${file}: ModuleHeadline takes ${prop} again`);
    }
  }
});

// Internal record: a ruling, a date, a decision id, a batch. None of it is the
// tenant's business. Written as escapes - this file stays ASCII.
const INTERNAL = [/owner/i, /ADR/, /\b20\d\d-\d\d/, /\bL\d\b/, /\u88c1\u5b9a/];

test("every page brief is one short line a tenant can read", () => {
  const zh = Object.entries(PAGE_BRIEF);
  assert.ok(zh.length >= 35);
  for (const [key, text] of zh) {
    assert.ok([...text].length <= 30, `${key}: ${[...text].length} characters`);
    for (const re of INTERNAL) assert.ok(!re.test(text), `${key} carries internal wording: ${re}`);
    assert.ok(!text.includes("\n"));
  }
});

test("the English briefs match the Chinese ones key for key, and stay short", () => {
  const en = enMessages.PAGE_BRIEF as Record<string, string>;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(PAGE_BRIEF).sort());
  for (const [key, text] of Object.entries(en)) {
    assert.ok(text.length <= 70, `${key}: ${text.length} characters`);
    for (const re of INTERNAL.slice(0, 4)) assert.ok(!re.test(text), `${key} carries internal wording`);
  }
});

test("every module key resolves to a brief", () => {
  const alias: Record<string, string> = { forecastRule: "forecast", namedAccount: "named", winLossReview: "winloss" };
  for (const file of pages(APP)) {
    const src = readFileSync(file, "utf8");
    const m = src.match(/<ModuleHeadline[^]*?moduleKey="(\w+)"([^]*?)\/>/);
    if (!m) continue;
    const brief = m[2].match(/brief="(\w+)"/)?.[1] ?? alias[m[1]] ?? m[1];
    assert.ok(PAGE_BRIEF[brief], `${file}: no PAGE_BRIEF.${brief}`);
  }
});

const ADMIN_LISTS = ["opportunity", "division", "org", "reminder", "roles", "roles/groups", "scope", "product", "audit", "permissions", "diagnostics", "industry", "members", "migration"];

test("the admin list headers carry no rule either", () => {
  for (const d of ADMIN_LISTS) {
    const src = read("admin", d, "page.tsx");
    const at = src.indexOf("<ViewHeader");
    assert.ok(at >= 0, d);
    assert.ok(src.slice(at, at + 400).includes("divider={false}"), `admin/${d}: header keeps its rule`);
  }
});
