import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectPageSurfaces } from "../../../scripts/guardrails/check-page-surfaces.mjs";

const REPO = join(import.meta.dirname, "../../..");

test("every real page has reviewed entry evidence and every UI module is reachable", () => {
  const manifest = JSON.parse(readFileSync(join(REPO, "scripts/guardrails/page-surfaces.json"), "utf8"));
  const result = inspectPageSurfaces(join(REPO, "portals/app/app"), manifest);
  assert.deepEqual(result.errors, []);
  assert.equal(result.pages.length, 79);
  assert.equal(result.slots.length, 70);
  assert.ok(result.controls.length > 800);
});

function fixture(run: (root: string, manifest: any, put: (file: string, source: string) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), "yucer-surface-test-"));
  const put = (file: string, source: string) => {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), source);
  };
  const manifest = { pages: [{ file: "(app)/sample/page.tsx", route: "/sample", kind: "navigation", entry: { file: "(app)/nav.tsx", needle: 'href="/sample"' } }], preservedControls: {} };
  try {
    put("(app)/layout.tsx", 'import "./nav"; export default function Layout(){return null}');
    put("(app)/nav.tsx", 'export const nav = <a href="/sample">Sample</a>');
    put("(app)/sample/page.tsx", 'export default function Page(){return <Button>Open</Button>}');
    run(root, manifest, put);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("missing pages, stale entries and orphaned UI cannot pass the route inventory", () => fixture((root, manifest, put) => {
  put("(app)/hidden/page.tsx", "export default function Hidden(){return null}");
  put("(app)/orphan.tsx", "export const Orphan = () => null");
  put("(app)/@deck/unpaired/page.tsx", "export default function Slot(){return null}");
  manifest.pages.push({ ...manifest.pages[0], file: "removed/page.tsx", route: "/removed" });
  const errors = inspectPageSurfaces(root, manifest).errors.join("\n");
  assert.match(errors, /page missing reviewed entry/);
  assert.match(errors, /UI module has no import path/);
  assert.match(errors, /parallel slot has no reviewed primary/);
  assert.match(errors, /manifest refers to removed page/);
}));

test("entry text alone is insufficient when its module is unreachable", () => fixture((root, manifest, put) => {
  put("(app)/layout.tsx", "export default function Layout(){return null}");
  const errors = inspectPageSurfaces(root, manifest).errors.join("\n");
  assert.match(errors, /entry module is not imported/);
}));

test("a self-link, wrong route and unknown classification are rejected", () => fixture((root, manifest, put) => {
  manifest.pages[0].entry.file = manifest.pages[0].file;
  manifest.pages[0].route = "/wrong";
  manifest.pages[0].kind = "unknown";
  put(manifest.pages[0].file, 'export default function Page(){return <a href="/sample">Self</a>}');
  const errors = inspectPageSurfaces(root, manifest).errors.join("\n");
  assert.match(errors, /self-reference/);
  assert.match(errors, /route mismatch/);
  assert.match(errors, /unknown classification/);
}));

test("lost entry evidence and duplicate registration are rejected", () => fixture((root, manifest, put) => {
  put("(app)/nav.tsx", "export const nav = null");
  manifest.pages.push(manifest.pages[0]);
  const errors = inspectPageSurfaces(root, manifest).errors.join("\n");
  assert.match(errors, /Duplicate manifest/);
  assert.match(errors, /entry evidence disappeared/);
}));

test("compatibility pages must redirect while paired deck pages remain legitimate", () => fixture((root, manifest, put) => {
  manifest.pages[0].kind = "compatibility";
  put("(app)/@deck/sample/page.tsx", "export default function Slot(){return null}");
  assert.match(inspectPageSurfaces(root, manifest).errors.join("\n"), /no longer redirects/);
  put("(app)/sample/page.tsx", 'export default function Page(){redirect("/new")}');
  assert.deepEqual(inspectPageSurfaces(root, manifest).errors, []);
}));

test("native controls and preserved sizes need explicit reviewed semantics", () => fixture((root, manifest, put) => {
  put("(app)/sample/page.tsx", 'export default function Page(){return <><button>Bad</button><input type="text"/><Button data-control-size="preserve"/><Button data-control-size="tiny"/></>}');
  const errors = inspectPageSurfaces(root, manifest).errors.join("\n");
  assert.match(errors, /classify native button/);
  assert.match(errors, /unclassified native input/);
  assert.match(errors, /preserved control needs/);
  assert.match(errors, /unknown control size/);
  put("(app)/sample/page.tsx", 'export default function Page(){return <><button data-control-kind="structural"/><input type="checkbox"/><Button data-control-size="compact"/></>}');
  assert.deepEqual(inspectPageSurfaces(root, manifest).errors, []);
}));

test("reexports and literal dynamic imports count as runtime reachability", () => fixture((root, manifest, put) => {
  put("(app)/sample/page.tsx", 'export { default } from "../bridge";');
  put("(app)/bridge.tsx", 'import("./lazy"); export default function Page(){return null}');
  put("(app)/lazy.tsx", "export const lazy = true;");
  assert.deepEqual(inspectPageSurfaces(root, manifest).errors, []);
}));
