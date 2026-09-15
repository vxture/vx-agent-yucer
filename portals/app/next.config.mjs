import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for the container runner (single owned image <code>-app).
  output: "standalone",
  // Pin the file-tracing root to the workspace root so the standalone layout is
  // deterministic (server.js lands at .next/standalone/portals/app/server.js).
  outputFileTracingRoot: join(here, "../.."),
  // The workspace shared package ships TypeScript source; Next transpiles it.
  transpilePackages: ["@yucer/shared"],
  reactStrictMode: true,
  // TD-029: `next dev` answered every route with a 500 from v0.1.6 onward.
  //
  // instrumentation.ts dynamically imports app/jobs/scheduler.ts (ADR-033,
  // guarded on NEXT_RUNTIME === "nodejs" before the import ever runs) which
  // reaches ioredis and, through the Prisma adapter, pg - both Node
  // libraries, both eventually touching Node's own built-in modules
  // (stream, fs, crypto, ...) and, transitively, several of THEIR OWN
  // sub-dependencies that do the same (redis-parser -> string_decoder,
  // pg-connection-string -> fs, pgpass -> path, ...).
  //
  // `next build` never hits this: it compiles instrumentation.ts ONLY for
  // the node runtime, where every one of those built-ins is real. `next
  // dev` compiles it for at least one OTHER runtime too (instrumentation
  // can theoretically run under either), and there Node's built-ins do not
  // exist - the runtime guard makes the import a no-op, but webpack still
  // has to resolve the import target to build that runtime's chunk graph,
  // guard or not.
  //
  // serverExternalPackages was tried first and worked for most of this
  // chain (each externalized package's own requires resolve relative to
  // ITS OWN file, which pnpm's non-flat layout allows even though the same
  // name cannot be required from this app's own code) - except for
  // "redis-parser" by itself, which broke every OTHER externalized package
  // in the same build the moment it was added, for a reason that did not
  // turn out to be name collision, list length, or ordering. Whatever it
  // is, working around one npm package's behaviour under one bundler
  // configuration is not something to depend on staying fixed across a
  // version bump either way.
  //
  // So this goes a layer lower, at the thing both problems actually have in
  // common: NONE of Node's built-in modules exist outside the node runtime,
  // regardless of which package or how many hops away is asking for one.
  // `resolve.fallback: { x: false }` tells webpack "do not try to bundle a
  // browser polyfill for x, just leave the require() unresolved" for a bare
  // specifier; `node:x` is a URI SCHEME rather than a specifier and
  // resolve.fallback never sees it at all (a separate, harder
  // UnhandledSchemeError), so it needs an externals entry instead, telling
  // webpack the module is available via require() at runtime rather than
  // something to bundle. Both are true here in the sense that matters: the
  // node-runtime bundle (the one that actually ships and actually needs
  // Redis and Postgres) is untouched by this whole block, because it only
  // runs `if (nextRuntime !== "nodejs")` - and the other runtime's bundle
  // never calls require() on any of this in the first place, since the
  // guarded dynamic import that pulled it in is exactly what never
  // executes there.
  webpack(config, { nextRuntime }) {
    if (nextRuntime !== "nodejs") {
      const builtins = [
        "assert", "async_hooks", "buffer", "child_process", "crypto",
        "diagnostics_channel", "dns", "events", "fs", "http", "https", "net",
        "os", "path", "perf_hooks", "querystring", "stream",
        "string_decoder", "timers", "tls", "tty", "url", "util", "zlib",
      ];
      config.resolve.fallback = {
        ...config.resolve.fallback,
        ...Object.fromEntries(builtins.map((name) => [name, false])),
      };
      if (Array.isArray(config.externals)) {
        config.externals.push(({ request }, callback) => {
          if (request && request.startsWith("node:")) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        });
      }
    }
    return config;
  },
};

export default nextConfig;
