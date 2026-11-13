/** Product UI inventory: reverse route coverage, entry evidence and native controls.
 * Run from any directory. No server or database access; never follows actions.
 * The reviewed manifest supplies UI evidence, not arbitrary URL string matches
 * (revalidatePath and breadcrumbs alone do not establish an entry point).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const root = path.join(repo, "portals/app/app");
const require = createRequire(path.join(repo, "portals/app/package.json"));
const { parser } = require("next/dist/compiled/babel/bundle.js");
const manifest = JSON.parse(fs.readFileSync(new URL("./page-surfaces.json", import.meta.url), "utf8"));
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(ts|tsx)$/.test(f) && !/\.(test|db\.test)\.tsx?$/.test(f)) files.push(f);
  }
}
walk(root);
const tags = new Set(["Button", "DestructiveButton", "Input", "NativeSelect", "Combobox", "SelectTrigger", "Textarea", "TabsList", "TabsTrigger", "SegmentedControl", "Toggle", "ToggleGroupItem", "DialogForm", "Drawer", "ActionMenu", "ConfirmDestructive", "button", "input", "select", "textarea", "CollapsibleTrigger", "PopoverTrigger", "DialogTrigger", "DropdownMenuTrigger", "AlertDialogTrigger", "Pagination", "BulkActionBar", "FilterBar", "ViewModeSwitch"]);
function visit(n, cb) {
  if (!n || typeof n !== "object") return;
  cb(n);
  for (const [k, v] of Object.entries(n)) {
    if (["loc", "start", "end", "extra"].includes(k)) continue;
    if (Array.isArray(v)) v.forEach((c) => c?.type && visit(c, cb));
    else if (v?.type) visit(v, cb);
  }
}
const sources = new Map();
const controls = [];
const errors = [];
for (const f of files) {
  const file = path.relative(root, f);
  const source = fs.readFileSync(f, "utf8");
  const ast = parser().parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const imports = [];
  visit(ast, (n) => {
    const importSource = ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(n.type)
      ? n.source?.value
      : n.type === "CallExpression" && (n.callee?.type === "Import" || n.callee?.name === "require") ? n.arguments?.[0]?.value : null;
    if (importSource?.startsWith(".")) {
      const base = path.resolve(path.dirname(f), importSource);
      const dst = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (dst) imports.push(path.relative(root, dst));
    }
    if (n.type !== "JSXOpeningElement" || n.name.type !== "JSXIdentifier") return;
    const attrs = Object.fromEntries(n.attributes.filter((a) => a.type === "JSXAttribute").map((a) => [a.name.name, a.value?.type === "StringLiteral" ? a.value.value : source.slice(a.value?.start ?? a.start, a.value?.end ?? a.end)]));
    if (!tags.has(n.name.name) && !attrs["data-control-kind"]) return;
    if (attrs["data-control-size"] === "preserve" && !manifest.preservedControls?.[file]) errors.push(`${file}:${n.loc.start.line}: preserved control needs a reviewed reason in the manifest`);
    const control = { file, line: n.loc.start.line, tag: n.name.name, attrs };
    controls.push(control);
    if (["button", "select", "textarea"].includes(control.tag) && !attrs["data-control-kind"]) errors.push(`${file}:${control.line}: classify native ${control.tag}; use the DS for new operation controls`);
    if (control.tag === "input" && !["checkbox", "radio", "file", "hidden"].includes(attrs.type) && !attrs["data-control-kind"]) errors.push(`${file}:${control.line}: unclassified native input`);
    if (attrs["data-control-size"] && !["regular", "compact", "preserve"].includes(attrs["data-control-size"])) errors.push(`${file}:${control.line}: unknown control size`);
  });
  sources.set(file, { source, imports });
}
const pages = [...sources.keys()].filter((f) => path.basename(f) === "page.tsx" && !f.includes("/@"));
const slots = [...sources.keys()].filter((f) => path.basename(f) === "page.tsx" && f.includes("/@"));
const entries = new Map(manifest.pages.map((p) => [p.file, p]));
if (entries.size !== manifest.pages.length) errors.push("Duplicate manifest page file");
const reachable = new Set();
function follow(file) {
  if (reachable.has(file) || !sources.has(file)) return;
  reachable.add(file);
  for (const next of sources.get(file).imports) follow(next);
}
for (const file of sources.keys()) if (["page.tsx", "layout.tsx", "default.tsx", "route.ts", "error.tsx", "global-error.tsx", "not-found.tsx", "loading.tsx", "template.tsx"].includes(path.basename(file))) follow(file);
for (const file of pages) {
  const entry = entries.get(file);
  if (!entry) { errors.push(`${file}: page missing reviewed entry classification`); continue; }
  const route = "/" + file.split("/").filter((s) => !/^\(.*\)$/.test(s) && s !== "page.tsx").join("/");
  if (entry.route !== route) errors.push(`${file}: route mismatch ${entry.route} != ${route}`);
  if (!["navigation", "context", "compatibility", "development", "diagnostic"].includes(entry.kind)) errors.push(`${file}: unknown classification`);
  const evidence = sources.get(entry.entry.file);
  if (!evidence?.source.includes(entry.entry.needle)) errors.push(`${file}: entry evidence disappeared (${entry.entry.file})`);
  if (!reachable.has(entry.entry.file)) errors.push(`${file}: entry module is not imported from any page/layout`);
  if (entry.entry.file === file && entry.kind !== "compatibility") errors.push(`${file}: self-reference does not establish a UI entry`);
  if (entry.kind === "compatibility" && !sources.get(file).source.includes("redirect(")) errors.push(`${file}: compatibility route no longer redirects`);
}
for (const file of entries.keys()) if (!pages.includes(file)) errors.push(`${file}: manifest refers to removed page`);
for (const slot of slots) {
  const primary = slot.replace(/\/@[^/]+/, "");
  if (!entries.has(primary)) errors.push(`${slot}: parallel slot has no reviewed primary page`);
}
// Product UI modules under app have no external package export. A zero-import
// TSX file outside the Next entry conventions has no runtime surface.
for (const file of sources.keys()) {
  if (file.endsWith(".tsx") && !reachable.has(file)) errors.push(`${file}: UI module has no import path from a Next entry`);
}
const counts = {};
for (const c of controls) counts[c.tag] = (counts[c.tag] ?? 0) + 1;
const result = { pages: manifest.pages, slots, sources: sources.size, controls, counts, errors };
const jsonAt = process.argv.indexOf("--json");
if (jsonAt >= 0) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(result, null, 2) + "\n");
for (const e of errors) console.error(e);
console.log(`${pages.length} pages, ${slots.length} parallel slots, ${sources.size} sources, ${controls.length} control declarations; ${errors.length} errors`);
if (errors.length) process.exitCode = 1;
