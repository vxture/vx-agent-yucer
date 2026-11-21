import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Check the compiled output against the reviewed inventory, which survives a
 * source directory being accidentally removed by the image context filter. */
export function missingBuiltPages(pages, compiled, exists) {
  return pages.flatMap(page => {
    const key = `/${page.file.replace(/\.tsx?$/, "")}`;
    const artifact = compiled[key];
    return artifact && exists(artifact) ? [] : [page.route];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const server = path.join(repo, "portals/app/.next/server");
  const { pages } = JSON.parse(fs.readFileSync(path.join(repo, "scripts/guardrails/page-surfaces.json"), "utf8"));
  const compiled = JSON.parse(fs.readFileSync(path.join(server, "app-paths-manifest.json"), "utf8"));
  const missing = missingBuiltPages(pages, compiled, artifact => fs.existsSync(path.join(server, artifact)));
  if (missing.length) {
    console.error(`[built-pages] Missing compiled routes: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else console.log(`[built-pages] OK - ${pages.length} reviewed pages compiled and present.`);
}
