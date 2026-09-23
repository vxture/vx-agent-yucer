import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// A person is shown by NAME (lib/member-names.tsx). A sweep of 27 pages on
// 2026-09-24 found raw member subs (usr_demo_m010) on twelve of them, each
// printed straight into JSX as {row.ownerSub}. This refuses that shape.

const ROOT = join(process.cwd(), "app", "(app)");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const RAW = /\{\s*[A-Za-z_.]+\.(ownerSub|managerSub|assigneeSub|presalesSub|deliverySub)\s*(\?\?[^}]*)?\}/;

test("no component prints an owner / manager / assignee sub straight into JSX", () => {
  const offenders = walk(ROOT)
    .flatMap((p) =>
      readFileSync(p, "utf8")
        .split("\n")
        .map((line, i) => ({ p, line, i }))
        .filter(({ line }) => RAW.test(line) && !/value=\{|key=\{|sub=\{/.test(line)),
    )
    .map(({ p, i }) => `${p.slice(ROOT.length + 1)}:${i + 1}`);
  assert.deepEqual(offenders, [], `render <MemberName sub=...> or useMemberName() instead:\n  ${offenders.join("\n  ")}`);
});
