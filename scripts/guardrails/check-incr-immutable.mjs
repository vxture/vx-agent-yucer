// TD-028: once an increment reaches the base branch, fix it with a new file.
import { execFileSync } from "node:child_process";

export function changedExistingIncrements(base, head = "HEAD", cwd = process.cwd()) {
  if (!/^[a-f0-9]{40}$/.test(base) || !(head === "HEAD" || /^[a-f0-9]{40}$/.test(head))) {
    throw new Error("expected full commit SHA (or HEAD for the comparison head)");
  }
  // Re-encode validated object IDs so no caller-supplied option syntax crosses
  // the process boundary. Git receives only hexadecimal revision identifiers.
  const baseId = Buffer.from(base, "hex").toString("hex");
  const headId = head === "HEAD" ? "HEAD" : Buffer.from(head, "hex").toString("hex");
  const options = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  const prefix = "deploy/database/ddl/incr/";
  const existing = execFileSync("/usr/bin/git", ["ls-tree", "-r", "--name-only", "-z", baseId, "--", prefix], options)
    .split("\0").filter((path) => path.endsWith(".sql"));
  const changed = new Set(execFileSync("/usr/bin/git", ["diff", "--no-renames", "--name-only", "-z", baseId, headId, "--", prefix], options).split("\0"));
  return existing.filter((path) => changed.has(path));
}

export function checkIncrementHistory(base, cwd = process.cwd()) {
  if (!base) throw new Error("base revision required; refusing to skip increment immutability");
  const changed = changedExistingIncrements(base, "HEAD", cwd);
  if (changed.length) {
    return { ok: false, message: "[incr-immutable] Existing increments changed; add a new increment instead:\n" + changed.join("\n") };
  }
  return { ok: true, message: "[incr-immutable] OK - existing SQL increments unchanged." };
}

if (process.argv[1]?.endsWith("check-incr-immutable.mjs")) {
  const result = checkIncrementHistory(process.argv[2]);
  console.log(result.message);
  process.exitCode = result.ok ? 0 : 1;
}
