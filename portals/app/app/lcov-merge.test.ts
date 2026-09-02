import { test } from "node:test";
import assert from "node:assert/strict";
// The CI script itself, the way lcov-paths.test.ts imports its own: the thing
// that runs in the pipeline is the thing under test, not a copy of its logic.
import { mergeLcov, run } from "../../../scripts/ci/merge-lcov.mjs";

/** Pull one record's lines out of a merged report, for readable assertions. */
function record(text: string, sf: string): string[] {
  const lines = text.split("\n");
  const start = lines.indexOf(`SF:${sf}`);
  assert.notEqual(start, -1, `no record for ${sf}`);
  return lines.slice(start, lines.indexOf("end_of_record", start) + 1);
}

test("a function called in only ONE half comes out covered", () => {
  // The entire point of TD-020. `record` is never called by the offline suite
  // and always called by the db suite; before the merge, Sonar saw only the
  // first number and reported the adapter as dead code.
  const offline = "SF:a/prisma-store.ts\nFN:11,record\nFNDA:0,record\nend_of_record\n";
  const db = "SF:a/prisma-store.ts\nFN:11,record\nFNDA:7,record\nend_of_record\n";
  const { text } = mergeLcov([offline, db]);
  const r = record(text, "a/prisma-store.ts");
  assert.ok(r.includes("FNDA:7,record"));
  assert.ok(r.includes("FNH:1"), "the function must count as hit after the merge");
});

test("line and branch hits SUM across the two runs", () => {
  const a = "SF:a.ts\nDA:1,2\nDA:2,0\nBRDA:5,0,0,1\nBRDA:5,0,1,0\nend_of_record\n";
  const b = "SF:a.ts\nDA:1,3\nDA:2,4\nBRDA:5,0,0,0\nBRDA:5,0,1,2\nend_of_record\n";
  const r = record(mergeLcov([a, b]).text, "a.ts");
  assert.ok(r.includes("DA:1,5"));
  assert.ok(r.includes("DA:2,4"), "a line only the second run reached is now covered");
  assert.ok(r.includes("BRDA:5,0,1,2"));
  assert.ok(r.includes("LF:2"), "two distinct lines, not four");
  assert.ok(r.includes("LH:2"));
  assert.ok(r.includes("BRH:2"), "both branches taken once the halves are combined");
});

test("summary counters are RECOMPUTED, never added", () => {
  // Adding LF/LH would double every file the two suites share, which is most of
  // them - and would report more instrumented lines than the file has.
  const half = "SF:a.ts\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n";
  const r = record(mergeLcov([half, half]).text, "a.ts");
  assert.ok(r.includes("LF:2"), "still two lines, not four");
  assert.ok(r.includes("LH:1"));
});

test("a branch neither run entered stays `-` rather than becoming 0", () => {
  // lcov distinguishes "not taken" (0) from "never evaluated" (-). Collapsing
  // the second into the first would report an unreachable block as a missed
  // branch and quietly inflate the denominator.
  const a = "SF:a.ts\nBRDA:5,0,0,-\nend_of_record\n";
  const b = "SF:a.ts\nBRDA:5,0,0,-\nend_of_record\n";
  assert.ok(record(mergeLcov([a, b]).text, "a.ts").includes("BRDA:5,0,0,-"));
});

test("`-` in one half and a count in the other yields the count", () => {
  const a = "SF:a.ts\nBRDA:5,0,0,-\nend_of_record\n";
  const b = "SF:a.ts\nBRDA:5,0,0,3\nend_of_record\n";
  assert.ok(record(mergeLcov([a, b]).text, "a.ts").includes("BRDA:5,0,0,3"));
});

test("a file present in only one report survives the merge", () => {
  // The db half touches ~10 files; the other 130 exist in the offline half
  // only, and dropping them would be a catastrophic "fix".
  const { text, files } = mergeLcov([
    "SF:only-offline.ts\nDA:1,1\nend_of_record\n",
    "SF:only-db.ts\nDA:1,1\nend_of_record\n",
  ]);
  assert.equal(files, 2);
  assert.match(text, /^SF:only-offline\.ts$/m);
  assert.match(text, /^SF:only-db\.ts$/m);
});

// --- the CLI's decisions ---------------------------------------------------

function io(files: Record<string, string>) {
  const written: Record<string, string> = {};
  const errors: string[] = [];
  return {
    written,
    errors,
    api: {
      readFile: (f: string) => files[f],
      writeFile: (f: string, t: string) => { written[f] = t; },
      exists: (f: string) => f in files,
      log: () => {},
      error: (m: string) => { errors.push(m); },
    },
  };
}

test("fewer than two inputs is a usage error, not a silent pass-through", () => {
  const h = io({ "a.info": "SF:a.ts\nend_of_record\n" });
  assert.equal(run(["out.info", "a.info"], h.api), 2);
  assert.deepEqual(Object.keys(h.written), []);
});

test("a missing input is refused rather than merged around", () => {
  const h = io({ "a.info": "SF:a.ts\nDA:1,1\nend_of_record\n" });
  assert.equal(run(["out.info", "a.info", "gone.info"], h.api), 1);
  assert.match(h.errors.join(""), /input missing: gone\.info/);
});

test("an input with no records at all is refused - the silent-half failure", () => {
  // If the db job's coverage step breaks and emits an empty file, the merge
  // would still "succeed" and Sonar would read exactly the pre-TD-020 number.
  // A fix that can quietly stop fixing is worse than no fix.
  const h = io({ "a.info": "SF:a.ts\nDA:1,1\nend_of_record\n", "b.info": "" });
  assert.equal(run(["out.info", "a.info", "b.info"], h.api), 1);
  assert.match(h.errors.join(""), /silently lost a half/);
  assert.deepEqual(Object.keys(h.written), []);
});

test("a good merge is written and reports 0", () => {
  const h = io({
    "a.info": "SF:a.ts\nFN:1,f\nFNDA:0,f\nDA:1,0\nend_of_record\n",
    "b.info": "SF:a.ts\nFN:1,f\nFNDA:2,f\nDA:1,2\nend_of_record\n",
  });
  assert.equal(run(["out.info", "a.info", "b.info"], h.api), 0);
  assert.match(h.written["out.info"], /FNDA:2,f/);
  assert.match(h.written["out.info"], /FNH:1/);
});
