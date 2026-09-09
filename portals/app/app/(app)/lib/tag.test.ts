import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// 标签与状态标的分界 - one rule, enforced (owner, 2026-09-09).
//
// `toneIcons.neutral` is "minus", so every `<StatusBadge tone="neutral">` draws
// a dash in front of its text. On a status badge whose tone is COMPUTED that
// mark is part of the DS's three-part composition and stays; on a badge that is
// ALWAYS neutral it is a mark standing in for a mark, fifty times over.
//
// The line is mechanical: an always-neutral badge is a Tag. This test is what
// keeps the fifty-first from arriving as a StatusBadge with a dash - the kind
// of drift nobody notices in review because each instance looks harmless.

const ROOT = join(import.meta.dirname, "..");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path));
    else if (entry.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/**
 * Every `<StatusBadge ...>` opening tag, with its props.
 *
 * A REGEX CANNOT DO THIS, and the first version of this guard proved it by
 * passing while an offender stood: `tone={m.ratio >= 1 ? "success" : "neutral"}`
 * contains a `>`, so a pattern that reads up to the first `>` stops inside the
 * expression, sees props that do not mention neutral, and waves it through.
 * Brace depth is the only way to know which `>` closes the tag.
 */
function badgeProps(src: string): { props: string; line: number }[] {
  const out: { props: string; line: number }[] = [];
  for (let i = src.indexOf("<StatusBadge"); i !== -1; i = src.indexOf("<StatusBadge", i + 1)) {
    let depth = 0;
    const from = i + "<StatusBadge".length;
    for (let j = from; j < src.length; j += 1) {
      const c = src[j];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) {
        out.push({ props: src.slice(from, j), line: src.slice(0, i).split("\n").length });
        break;
      }
    }
  }
  return out;
}

test("a badge that can be neutral is a Tag, not a StatusBadge with a dash", () => {
  /* THE THREE WAYS A DASH GETS IN: a literal tone="neutral", a computed
     `tone={x ? "success" : "neutral"}`, and a tone that arrives from a HELPER
     or a LOOKUP - healthTone() returns neutral for an unscored account,
     STAGE_TONE maps two stages to it. The first two are visible in the tag,
     the third is not, so this names the sources. */
  const NEUTRAL_SOURCES = [
    '"neutral"',
    "STAGE_TONE",
    "FORECAST_TONE",
    "ACTION_STATUS_TONE",
    "REVENUE_STATUS_TONE",
    "healthTone",
    "confidenceTone",
    "statusTone",
  ];
  const offenders: string[] = [];
  for (const path of tsxFiles(ROOT)) {
    if (path.endsWith("components/tag.tsx")) continue;
    const src = readFileSync(path, "utf8");
    for (const { props, line } of badgeProps(src)) {
      const source = NEUTRAL_SOURCES.find((s) => props.includes(s));
      if (source && !props.includes("icon={false}")) {
        offenders.push(`${path.slice(ROOT.length + 1)}:${line} (${source})`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these can render neutral, whose tone icon is a meaningless dash - use <Tag>",
  );
});

test("the scanner reads a tag whose props contain a comparison", () => {
  // The exact shape that fooled the regex. Without this the fix above is a
  // change nothing would notice being reverted.
  const sample = '<StatusBadge tone={r >= 1 ? "success" : "neutral"}>x</StatusBadge>';
  assert.deepEqual(
    badgeProps(sample).map((b) => b.props.trim()),
    ['tone={r >= 1 ? "success" : "neutral"}'],
  );
});

test("the scanner actually finds badges - guards against a vacuous pass", () => {
  let seen = 0;
  for (const path of tsxFiles(ROOT)) seen += badgeProps(readFileSync(path, "utf8")).length;
  assert.ok(seen > 20, `expected the coloured status badges to still be there, saw ${seen}`);
});
