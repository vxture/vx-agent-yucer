import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_LOCALE } from "@vxture/shared";
import { getDictionary } from "./dictionary";

// The dictionary registry and the zh/en CONTRACT.
//
// WHAT THIS DELIBERATELY DOES NOT DO: call the 145 formatters. Driving those to
// 100% would mean a hand-maintained table of correctly-typed arguments for each
// one - `joinFields` takes an array, `scoreExplain` a number, `healthReasonText`
// an object with a `code` - and a probe that guessed instead reported five
// "failures" and four "ignores its argument" that were all the probe's own
// fault, not the dictionary's. A table like that rots the moment somebody adds
// a formatter, and a rotting table produces exactly those false alarms in CI.
//
// So the number stays low on messages.ts, on purpose, and what is tested here
// is the thing that can actually break: the SHAPE both locales must share. The
// compiler checks the overrides in messages.en.ts; it cannot check what the
// registry hands a renderer at runtime, and it cannot check the claim in that
// file's own header about how much is translated.

type Node = Record<string, unknown>;

/** Every leaf path in a dictionary, with what lives there. */
function leaves(o: unknown, path = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof o === "function") {
    // Arity is part of the contract: a translator must not quietly drop a
    // parameter, which would render `undefined` into the sentence.
    out.set(path, `function/${(o as (...a: unknown[]) => unknown).length}`);
    return out;
  }
  if (Array.isArray(o)) {
    out.set(path, `array/${o.length}`);
    return out;
  }
  if (o !== null && typeof o === "object") {
    for (const [k, v] of Object.entries(o as Node)) leaves(v, path ? `${path}.${k}` : k, out);
    return out;
  }
  out.set(path, typeof o);
  return out;
}

const zh = getDictionary("zh-CN");
const en = getDictionary("en-US");

// --- the registry -----------------------------------------------------------

test("each locale resolves to its own dictionary", () => {
  assert.notEqual(zh, en, "en-US must not silently be the zh-CN object");
  assert.equal(typeof zh, "object");
  assert.equal(typeof en, "object");
});

test("a locale we do not have renders Chinese rather than nothing", () => {
  // The documented fallback: an unknown locale is a reason to render the
  // default, never a reason to throw into a page.
  const unknown = getDictionary("fr-FR" as never);
  assert.equal(unknown, getDictionary(DEFAULT_LOCALE));
  assert.equal(DEFAULT_LOCALE, "zh-CN");
});

test("getDictionary is total - no locale produces undefined", () => {
  for (const l of ["zh-CN", "en-US", "", "en", "zh", "xx-YY"]) {
    const d = getDictionary(l as never);
    assert.ok(d && typeof d === "object", `${l} produced ${String(d)}`);
  }
});

// --- the zh/en contract ------------------------------------------------------

test("en-US is COMPLETE by construction - no key is missing from it", () => {
  // messages.en.ts spreads zh and overrides. That is what makes it impossible
  // for a screen to render `undefined`, and this is the runtime proof of it -
  // the compiler checks each override in isolation, not the assembled object.
  const zhLeaves = leaves(zh);
  const enLeaves = leaves(en);
  const missing = [...zhLeaves.keys()].filter((k) => !enLeaves.has(k));
  assert.deepEqual(missing, [], `en-US is missing ${missing.length} key(s)`);
});

test("en-US invents nothing the Chinese dictionary does not have", () => {
  // The other direction. A key only in en is dead copy: no component can read
  // it, because every component reads the shape zh defines.
  const zhLeaves = leaves(zh);
  const extra = [...leaves(en).keys()].filter((k) => !zhLeaves.has(k));
  assert.deepEqual(extra, [], `en-US has ${extra.length} key(s) zh-CN does not`);
});

test("every key holds the same KIND of thing, with the same arity", () => {
  // A string translated into a function, or a two-argument formatter overridden
  // by a one-argument one, renders `undefined` in the middle of a sentence.
  const zhLeaves = leaves(zh);
  const enLeaves = leaves(en);
  const mismatched = [...zhLeaves.entries()]
    .filter(([k, v]) => enLeaves.get(k) !== v)
    .map(([k, v]) => `${k}: zh=${v} en=${enLeaves.get(k)}`);
  assert.deepEqual(mismatched, [], mismatched.join("; "));
});

test("the dictionary is not accidentally empty - guards against a vacuous pass", () => {
  // Every assertion above is over a set. If the walk ever returned nothing they
  // would all pass while proving nothing at all.
  const n = leaves(zh).size;
  assert.ok(n > 500, `walked only ${n} leaves; the dictionary is far larger than that`);
  assert.ok(
    [...leaves(zh).values()].some((v) => v.startsWith("function/")),
    "the walk must reach the formatters, not just the plain strings",
  );
});

// --- the claim in messages.en.ts's own header --------------------------------

test("the translated-constant count in the header is true, not a stale comment", () => {
  // The claim in that file's header. It used to read "65 of the 67 constants"
  // and name two exceptions; by the time this test was written the file held
  // 102 constants and six exceptions, and nothing had noticed - which is what
  // a count in a comment does. What is left is deliberate rather than overdue:
  // two /product-preview fixtures pinned to zh-CN, and TIER_LABEL, whose tier
  // names are commercial naming and wait on a product decision.
  const zhSrc = readFileSync(new URL("../messages.ts", import.meta.url), "utf8");
  const enSrc = readFileSync(new URL("../messages.en.ts", import.meta.url), "utf8");

  const exported = [...zhSrc.matchAll(/^export (?:const|function) ([A-Za-z_][A-Za-z0-9_]*)/gm)].map(
    (m) => m[1],
  );
  assert.ok(exported.length > 50, `parsed only ${exported.length} exports from messages.ts`);

  const untranslated = exported.filter((name) => !new RegExp(`^  ${name}:`, "m").test(enSrc));
  assert.deepEqual(
    untranslated.sort(),
    ["PREVIEW_FIXTURES", "PREVIEW_TEXT", "TIER_LABEL"],
    "the untranslated set changed - translate it, or move the header and this list together",
  );
});
