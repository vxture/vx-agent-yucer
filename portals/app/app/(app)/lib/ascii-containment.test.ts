import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// TD-002's containment, finally asked by a machine.
//
// The debt register said non-ASCII lives in exactly three files and that the
// claim "can be verified with a one-line command". The command never existed,
// and when it was finally run (2026-08-29) the raw count was THIRTY files.
// Measured precisely, the truth split three ways: 27 files were English
// comments quoting Chinese copy or upstream docs to explain a design - prose
// for maintainers, not product copy; two were the typographic separator "·";
// and one was a real stray - demo-seed.ts carried two segment names inline,
// in direct contradiction of the register's own "demo-seed only references
// demo-fixtures" claim. Same disease as TD-010's "recurred twice" that was
// really 21 sites: a register nobody re-measures drifts from the codebase it
// describes.
//
// What this guard pins is the claim that MATTERS: user-facing text - a string
// literal carrying CJK - stays in the named files. Comments are documentation
// and are not scanned; typographic separators are not text. The register's
// full debt (whether these files should exist at all) stays a platform-repo
// decision; this guard only stops the containment quietly rotting again.

const APP = join(process.cwd(), "app");

const ALLOWED = new Set([
  "(app)/lib/messages.ts",
  "(app)/lib/messages.en.ts",
  "domains/shared/demo-fixtures.ts",
  "domains/judgement/lib/judgement.ts",
  // The two vocabularies' pre-provisioned rows (0029): SEED DATA, not copy -
  // a delivered tenant is a usable product, and the workspace owns the rows
  // afterwards. Same nature as demo-fixtures: data that happens to be text.
  "domains/catalog/lib/status-vocab.ts",
  "domains/catalog/lib/type-vocab.ts",
  // 计价单位 (0037) joined them for the same reason, and the seed SQL carries
  // the identical rows - two copies of the same starter data, which the DDL
  // and this module have to agree on.
  "domains/catalog/lib/unit-vocab.ts",
  // 赢丢原因 (0039), the same shape again: six shipped rows a workspace renames
  // and extends. The names are seeded by the increment too, which is what makes
  // them data rather than the copy this containment is about.
  "domains/pipeline/lib/win-loss-vocab.ts",
  // 行业分类 (0040), the same shape a fourth time: thirteen shipped rows the
  // workspace renames and extends, seeded identically by the increment.
  "domains/account/lib/industry-vocab.ts",
  // The province vocabulary and the 全国样本 cohort built from it (incr/0035).
  // Same nature again - data that happens to be text - with one addition that
  // matters more here than anywhere else on this list: these 34 strings are a
  // KEY, not copy. They are matched against the database's CHECK constraint and
  // against the map's geometry, so escaping them would put three copies of an
  // identifier in three encodings and guarantee the drift provinces.test.ts
  // exists to catch.
  "domains/shared/provinces.ts",
  // The ground of every 省级市场 (incr/0045-0046): 367 unit names GENERATED
  // from yucer_ref.admin_division, a KEY like the 34 above - the db lane
  // proves file == table, which escaping would make impossible to read.
  "domains/shared/province-frames.ts",
  "domains/shared/demo-national.ts",
  // The map's shapes, keyed by that same vocabulary (incr/0035). Generated, and
  // a KEY rather than copy for the same reason provinces.ts is: escaping these
  // would put a third encoding of the same identifier in play and guarantee the
  // drift provinces.test.ts exists to catch.
  "(screen)/lib/china-geometry.ts",
  // 大区 (incr/0036). PRESET DATA, not copy, and the distinction is the whole
  // reason this file exists: the division names are rows the tenant may rename,
  // seeded by the SQL and read back from the database at runtime. This module
  // is the same preset for the in-memory store the demo runs on, and
  // market-division.test.ts parses incr/0036 and fails if the two disagree -
  // so escaping them here would put a second encoding of the seed in play and
  // guarantee exactly the drift that test exists to catch.
  "domains/shared/market-division.ts",
]);

// CJK and fullwidth ranges - actual text in a human language. The typographic
// middle dot and similar separators are deliberately not matched.
const CJK = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const FILES = walk(APP).filter((p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p));

function strayLiterals(text: string): number[] {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const lines = noBlock.split("\n");
  const hits: number[] = [];
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    for (const m of code.matchAll(/"([^"\\]*)"|'([^'\\]*)'|`([^`]*)`/g)) {
      const lit = m[1] ?? m[2] ?? m[3] ?? "";
      if (CJK.test(lit)) {
        hits.push(i + 1);
        break;
      }
    }
  });
  return hits;
}

test("the tree was scanned at all", () => {
  assert.ok(FILES.length > 100, `expected many source files, walked ${FILES.length}`);
  const inAllowed = FILES.filter((p) => ALLOWED.has(relative(APP, p)));
  assert.equal(inAllowed.length, ALLOWED.size, "every allowed file exists");
});

test("CJK string literals stay in the named files", () => {
  const strays: string[] = [];
  for (const p of FILES) {
    const rel = relative(APP, p);
    if (ALLOWED.has(rel)) continue;
    const hits = strayLiterals(readFileSync(p, "utf8"));
    if (hits.length) strays.push(`${rel} (lines ${hits.slice(0, 5).join(", ")})`);
  }
  assert.deepEqual(
    strays,
    [],
    `these files carry Chinese text in string literals outside the TD-002 ` +
      `containment - move it to the dictionary or the fixtures:\n  ${strays.join("\n  ")}`,
  );
});

// --- raw control bytes -------------------------------------------------------

/**
 * A control byte written as itself rather than as an escape.
 *
 * Tab, newline and carriage return are formatting and are allowed. Everything
 * else below 0x20 makes the file `data` to git, grep and every tool that asks
 * before reading - and the failure is SILENT in the direction that hurts:
 * `grep -r` prints "Binary file X matches" and withholds the line, so a search
 * of the codebase quietly skips the file rather than reporting nothing.
 *
 * Found that way. app/authz/store.ts carried one literal NUL as a composite-map
 * key separator, and a search for `displayName` returned a match it would not
 * show. The separator is right; writing it as the byte was not. `\0` is the
 * same value and leaves the file readable.
 */
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

test("no source file carries a raw control byte", () => {
  const bad: string[] = [];
  for (const p of FILES) {
    const text = readFileSync(p, "utf8");
    const i = text.search(CONTROL);
    if (i < 0) continue;
    const line = text.slice(0, i).split("\n").length;
    const code = text.charCodeAt(i).toString(16).padStart(2, "0");
    bad.push(`${relative(APP, p)}:${line} (0x${code})`);
  }
  assert.deepEqual(
    bad,
    [],
    `a raw control byte makes the file binary to grep and git, and the loss is ` +
      `silent - write the escape instead:\n  ${bad.join("\n  ")}`,
  );
});
