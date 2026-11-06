// TD-028: once an increment reaches the base branch, fix it with a new file.
import { execFileSync } from "node:child_process";

export function changedExistingIncrements(base, head = "HEAD", cwd = process.cwd()) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const prefix = "deploy/database/ddl/incr/";
  const existing = git("ls-tree", "-r", "--name-only", "-z", base, "--", prefix)
    .split("\0").filter((path) => path.endsWith(".sql"));
  const changed = new Set(git("diff", "--no-renames", "--name-only", "-z", base, head, "--", prefix).split("\0"));
  return existing.filter((path) => changed.has(path));
}

if (process.argv[1]?.endsWith("check-incr-immutable.mjs")) {
  const base = process.argv[2];
  if (!base) throw new Error("base revision required; refusing to skip increment immutability");
  const changed = changedExistingIncrements(base);
  if (changed.length) {
    console.error("[incr-immutable] Existing increments changed; add a new increment instead:\n" + changed.join("\n"));
    process.exitCode = 1;
  } else console.log("[incr-immutable] OK - existing SQL increments unchanged.");
}
