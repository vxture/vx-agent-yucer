import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// A MODULE HAS ONE NAME, AND THE MENU HOLDS IT.
//
// Found by the owner, 2026-09-05: the price book called itself 价目与底价 on
// the page and 产品定价 in the menu, and the same drift had happened three
// more times unnoticed (管理/成员与角色, 商机管道/商机管理, 报价/报价管理).
// Each was one edit that never reached the other place, which is what happens
// to a name kept in two places - so the fix was not four edits but one rule:
// the page reads DOMAIN_LABEL, and this test is why it stays that way.
//
// WHAT IT CHECKS: for every nav entry with a page of its own, the page's
// OPENING header either takes its title from DOMAIN_LABEL (directly or
// through ModuleHeadline's moduleKey) or is a COUNT LEAD - a headline that
// states a number rather than a name, which is a different thing and is
// listed below with its page.

const LIB = import.meta.dirname;
const APP = join(LIB, "..");

/**
 * Pages whose opening header is a COUNT, not a name.
 *
 * "12 家客户" answers a different question from "客户管理", and the product
 * uses both deliberately. They are listed rather than exempted silently: a
 * page that stops leading with its count should either name itself from the
 * registry or explain itself here.
 */
const COUNT_LEAD: Record<string, string> = {
  account: "leads with how many customers are on the books",
  campaign: "leads with how many campaigns are running",
  delivery: "leads with how many projects are in delivery",
  planning: "leads with the plan's own period and scope",
  strategy: "leads with how many plans are active",
  signal: "the queue's own count is the headline",
  copilot: "a conversation, not a register - it opens on the thread",
};

function navEntries(): { key: string; page: string }[] {
  const nav = readFileSync(join(LIB, "navigation.ts"), "utf8");
  const keys = [...nav.matchAll(/key: "(\w+)"/g)].map((m) => m[1]!);
  return [...new Set(keys)]
    .map((key) => ({ key, page: join(APP, key, "page.tsx") }))
    .filter((e) => existsSync(e.page));
}

/** The literal a `X_TEXT.key` reference resolves to, when it is a plain
 * string in the Chinese catalogue. Functions (count leads) resolve to null. */
function literal(dict: string, key: string): string | null {
  const msgs = readFileSync(join(LIB, "messages.ts"), "utf8");
  const at = msgs.indexOf(`export const ${dict}`);
  if (at < 0) return null;
  const m = new RegExp(`^  ${key}: "([^"]+)",`, "m").exec(msgs.slice(at));
  return m ? m[1]! : null;
}

function domainLabels(): Record<string, string> {
  const msgs = readFileSync(join(LIB, "messages.ts"), "utf8");
  const at = msgs.indexOf("export const DOMAIN_LABEL");
  const block = msgs.slice(at, msgs.indexOf("};", at));
  return Object.fromEntries(
    [...block.matchAll(/^ {2}(\w+): "([^"]+)",/gm)].map((m) => [m[1]!, m[2]!]),
  );
}

test("every module page calls itself what the menu calls it", () => {
  const labels = domainLabels();
  const wrong: string[] = [];

  for (const { key, page } of navEntries()) {
    if (key in COUNT_LEAD) continue;
    const src = readFileSync(page, "utf8");

    // ModuleHeadline takes the key and looks the name up itself - the shape
    // this test exists to encourage.
    if (new RegExp(`moduleKey="${key}"`).test(src)) continue;

    const header = /(?:ViewHeader|ModuleHeadline)[\s\S]{0,400}?title=\{([^}]+)\}/.exec(src);
    if (!header) continue; // no page-level header to compare
    const expr = header[1]!.trim();
    if (expr.startsWith("DOMAIN_LABEL")) continue;

    const ref = /^(\w+)\.(\w+)$/.exec(expr);
    const value = ref ? literal(ref[1]!, ref[2]!) : null;
    // A computed headline is a count lead; it belongs in the map above.
    if (value === null) {
      wrong.push(`${key}: opens on ${expr}, which is neither the registry nor a listed count lead`);
      continue;
    }
    if (value !== labels[key]) {
      wrong.push(`${key}: page says "${value}", menu says "${labels[key]}"`);
    }
  }

  assert.deepEqual(
    wrong,
    [],
    `a module's name lives in DOMAIN_LABEL and nowhere else: ${wrong.join("; ")}`,
  );
});

test("every listed count-lead page still exists and still leads with a count", () => {
  const pages = new Set(navEntries().map((e) => e.key));
  const stale = Object.keys(COUNT_LEAD).filter((k) => !pages.has(k));
  assert.deepEqual(stale, [], `these keys have no page any more: ${stale.join(", ")}`);
});
