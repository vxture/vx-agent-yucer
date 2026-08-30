import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve as presolve } from "node:path";

// TD-010's other half: "does this code reach a user" as a question a machine
// answers.
//
// The rule layer emits violation CODES; the sentence lives in a dictionary at
// the interface. That contract only holds if every code an action can emit has
// a sentence in the dictionary that renders it - otherwise useSaveAction-style
// fallbacks put the raw code on screen, which is the same leak TD-010 started
// with wearing a different hat.
//
// So this test walks the actual chain, statically:
//   binding site (on*={action} in a page/component)
//     -> host component, following prop forwarding (page -> Table -> Control)
//     -> the *_ERROR dictionaries that component renders
//   action function slice -> called service verbs -> violation("...") codes,
//     following same-domain calls a few levels deep
// and asserts codes ⊆ dictionary keys for every pair.
//
// The approximation is deliberately conservative: function slices run from an
// `export function` to the next export, so a verb's codes may include a
// neighbour helper's. An over-approximation costs one extra translated
// sentence; an under-approximation costs a raw code on screen. Only one of
// those is acceptable.
//
// When this was first run it found seven binding sites whose whole forwarding
// chain rendered NO dictionary - four of them discarded the result entirely
// (lead-list, signal-queue, proposal-queue, planning-table): a refused action
// looked exactly like a successful one. Silence is worse than a wrong
// sentence.

const APP = join(process.cwd(), "app");
const UI = join(APP, "(app)");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function slices(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const marks = [...text.matchAll(/export (?:async )?function (\w+)/g)];
  marks.forEach((m, i) => {
    out.set(m[1], text.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : text.length));
  });
  return out;
}

function importsOf(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    for (const raw of m[1].split(",")) {
      const n = raw.trim().replace(/^type /, "").split(" as ")[0].trim();
      if (n) out.set(n, m[2]);
    }
  }
  return out;
}

function resolveModule(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = presolve(dirname(from), spec);
  for (const c of [base + ".ts", base + ".tsx", join(base, "index.ts")]) {
    if (existsSync(c)) return c;
  }
  return null;
}

const CODE_RE = /violation\(\s*\n?\s*"([a-z0-9_]+)"/g;

function codesOfFn(file: string, fn: string, depth: number, seen: Set<string>): Set<string> {
  const key = file + "#" + fn;
  if (seen.has(key) || depth > 3) return new Set();
  seen.add(key);
  const text = readFileSync(file, "utf8");
  const body = slices(text).get(fn);
  if (!body) return new Set();
  const out = new Set([...body.matchAll(CODE_RE)].map((m) => m[1]));
  for (const [name, spec] of importsOf(text)) {
    if (!new RegExp(`\\b${name}\\(`).test(body)) continue;
    const tgt = resolveModule(file, spec);
    if (tgt) for (const c of codesOfFn(tgt, name, depth + 1, seen)) out.add(c);
  }
  for (const other of slices(text).keys()) {
    if (other !== fn && new RegExp(`\\b${other}\\(`).test(body)) {
      for (const c of codesOfFn(file, other, depth + 1, seen)) out.add(c);
    }
  }
  return out;
}

// 1. server-action functions -> reachable violation codes
const actionCodes = new Map<string, Set<string>>();
for (const f of walk(UI).filter((p) => p.endsWith(".ts") && !p.endsWith(".test.ts"))) {
  const text = readFileSync(f, "utf8");
  if (!text.includes('"use server"')) continue;
  const imps = importsOf(text);
  for (const [fn, body] of slices(text)) {
    const codes = new Set<string>();
    for (const [name, spec] of imps) {
      if (!spec.includes("/domains/")) continue;
      if (!new RegExp(`\\b${name}\\(`).test(body)) continue;
      const tgt = resolveModule(f, spec);
      if (tgt) for (const c of codesOfFn(tgt, name, 0, new Set())) codes.add(c);
    }
    if (codes.size) actionCodes.set(fn, codes);
  }
}

// 2. component files and the dictionaries each renders
const compFiles = new Map<string, string>();
for (const f of walk(join(UI, "components")).filter(
  (p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx"),
)) {
  const name = f.slice(f.lastIndexOf("/") + 1, -".tsx".length);
  compFiles.set(name, readFileSync(f, "utf8"));
}
const kebab = (n: string) => n.replace(/([A-Z])/g, (m) => "-" + m.toLowerCase()).replace(/^-/, "");

/**
 * A component name to the file that DEFINES it.
 *
 * The kebab of the name is right for the common case, where a file exports one
 * component named after it. It is wrong whenever a file exports several -
 * catalog-panels.tsx exports CatalogPanels, SolutionSection and PriceSection
 * since 2026-08-30 - and the fallback matters: the guard reported two working
 * components as dictionary-less because "solution-section.tsx" does not exist,
 * not because anything was unwired. So: try the kebab, then find whoever
 * exports the name.
 */
function fileOf(comp: string, pascal: string): string | null {
  if (compFiles.has(comp)) return comp;
  for (const [name, text] of compFiles) {
    if (new RegExp(`export function ${pascal}\\b`).test(text)) return name;
  }
  return null;
}

function dictsReached(comp: string, depth: number): Set<string> {
  if (depth > 3 || !compFiles.has(comp)) return new Set();
  const text = compFiles.get(comp)!;
  const out = new Set([...text.matchAll(/\b([A-Z_]+_ERROR)\b/g)].map((m) => m[1]));
  const opens = [...text.matchAll(/<([A-Z]\w+)/g)];
  for (const am of text.matchAll(/\bon\w+=\{(\w+)\}/g)) {
    let host: string | null = null;
    for (const o of opens) {
      if ((o.index ?? 0) < (am.index ?? 0)) host = o[1];
      else break;
    }
    const inner = host ? fileOf(kebab(host), host) : null;
    if (inner && inner !== comp) {
      for (const d of dictsReached(inner, depth + 1)) out.add(d);
    }
  }
  return out;
}

// 3. binding sites
const pairs = new Set<string>(); // "action|dict"
const unrendered = new Set<string>();
// Components with a complete in-file error mapping of their own (a function
// with a guaranteed fallback), verified by reading them - not a dictionary the
// regex can see.
const SELF_MAPPED = new Set(["copilot-chat"]);
for (const f of walk(UI).filter((p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx"))) {
  const text = readFileSync(f, "utf8");
  const opens = [...text.matchAll(/<([A-Z]\w+)/g)];
  for (const am of text.matchAll(/\bon\w+=\{(\w+)\}/g)) {
    const a = am[1];
    if (!actionCodes.has(a)) continue;
    let host: string | null = null;
    for (const o of opens) {
      if ((o.index ?? 0) < (am.index ?? 0)) host = o[1];
      else break;
    }
    if (!host) continue;
    const comp = fileOf(kebab(host), host) ?? kebab(host);
    if (SELF_MAPPED.has(comp)) continue;
    const ds = dictsReached(comp, 0);
    if (ds.size === 0) unrendered.add(`${a} in <${comp}>`);
    else for (const d of ds) pairs.add(`${a}|${d}`);
  }
}

// 4. dictionary keys, from the messages module itself
const msgs = readFileSync(join(UI, "lib", "messages.ts"), "utf8");
function dictKeys(name: string): Set<string> {
  const m = msgs.match(new RegExp(`export const ${name}[^=]*= \\{([\\s\\S]*?)\\n\\};`));
  if (!m) return new Set();
  const keys = new Set([...m[1].matchAll(/^\s{2}([a-z0-9_]+):/gm)].map((k) => k[1]));
  if (m[1].includes("...GATE_ERROR")) {
    for (const k of ["not_authenticated", "permission_denied", "feature_not_in_tier", "denied"])
      keys.add(k);
  }
  return keys;
}

test("the chain was extracted at all - guards against a silently empty sweep", () => {
  assert.ok(actionCodes.size > 20, `expected many actions, extracted ${actionCodes.size}`);
  assert.ok(pairs.size > 20, `expected many pairs, extracted ${pairs.size}`);
});

test("every binding site renders its errors through some dictionary", () => {
  assert.deepEqual(
    [...unrendered].sort(),
    [],
    `these actions are bound to components whose whole forwarding chain renders ` +
      `no error dictionary - a refusal is either swallowed or shown raw:\n  ` +
      [...unrendered].sort().join("\n  "),
  );
});

test("every reachable violation code has a sentence in the rendering dictionary", () => {
  const missing: string[] = [];
  for (const pair of [...pairs].sort()) {
    const [action, dict] = pair.split("|");
    const keys = dictKeys(dict);
    if (keys.size === 0) continue; // dictionary lives outside messages.ts - not this test's claim
    for (const code of [...actionCodes.get(action)!].sort()) {
      if (!keys.has(code)) missing.push(`${dict} lacks "${code}" (reachable via ${action})`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `these codes can reach the user but have no sentence - the fallback would ` +
      `show the raw code:\n  ${missing.join("\n  ")}`,
  );
});
