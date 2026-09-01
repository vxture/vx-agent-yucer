import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The dictionaries are PLAIN TEXT, and nothing renders markdown in them.
//
// Found by looking at a screenshot: a panel description read
// "……而且**还有未完成项时战役无法标记完成**。" with the asterisks on screen.
// The one I had just written was easy to fix; looking for others turned up
// three that had been shipping literal `**` to users for batches - including
// one on the account page I had read out loud in a browser dump and not seen.
//
// Emphasis in this product's copy is carried by 「」 in Chinese and by sentence
// structure in English. A message that needs bold is a message that needs
// rewriting, so this is a value-domain check rather than a formatting one: no
// renderer will ever interpret these, so an asterisk pair is always literal.

const LIB = import.meta.dirname;

function stringLiterals(source: string): string[] {
  // Double-quoted and backtick literals, minus escaped quotes. Crude on
  // purpose: it only has to see enough to catch a `**` a human typed.
  return [
    ...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g),
    ...source.matchAll(/`((?:[^`\\]|\\.)*)`/gs),
  ].map((m) => m[1]!);
}

for (const file of ["messages.ts", "messages.en.ts"]) {
  test(`${file} carries no markdown emphasis in a user-facing string`, () => {
    const source = readFileSync(join(LIB, file), "utf8");
    const offenders = stringLiterals(source).filter((s) => /\*\*|__[^_]/.test(s));
    assert.deepEqual(
      offenders,
      [],
      `these strings contain markdown nothing will render, so the marks reach the ` +
        `screen: ${offenders.join(" | ")}`,
    );
  });
}

test("the literal scanner actually finds strings - guards against a vacuous pass", () => {
  // Without this the regex could match nothing and both checks above would pass
  // over an empty list forever.
  const found = stringLiterals(readFileSync(join(LIB, "messages.ts"), "utf8"));
  assert.ok(found.length > 500, `expected many strings, found ${found.length}`);
  assert.ok(
    stringLiterals('const a = "x**y";').some((s) => s.includes("**")),
    "and it can see an offender when there is one",
  );
});

// --- The capability label map covers exactly the capabilities ----------------

test("every capability has a label and every label names a capability", async () => {
  // TWO LISTS THAT MUST AGREE, and nothing made them. They agree today, which
  // is the reason to assert it now rather than after they stop.
  //
  // Each direction fails differently. A capability with no label renders as the
  // unlabelled fallback, so a real proposal loses the grouping it was given -
  // quiet, and it looks like the data is missing rather than the dictionary. A
  // label for something that is no longer a capability is worse: it survives
  // the retirement and keeps naming history that the domain has stopped
  // recognising, which is precisely what capabilityLabel's isCapability check
  // exists to prevent.
  const { CAPABILITIES } = await import("../../domains/copilot/lib/capability");
  const { BOARD_TEXT } = await import("./messages");
  const { en } = await import("./messages.en");

  const caps = [...CAPABILITIES].sort();
  assert.deepEqual(Object.keys(BOARD_TEXT.capabilityLabels).sort(), caps);
  assert.deepEqual(Object.keys(en.BOARD_TEXT.capabilityLabels).sort(), caps);
});
