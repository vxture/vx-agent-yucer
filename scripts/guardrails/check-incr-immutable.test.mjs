import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { changedExistingIncrements } from "./check-incr-immutable.mjs";

test("allows new increments but rejects edits, deletions and renames of existing SQL", () => {
  const cwd = mkdtempSync(join(tmpdir(), "yucer-ddl-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
  try {
    git("init"); git("config", "user.name", "test"); git("config", "user.email", "test@example.invalid");
    const prefix = "deploy/database/ddl/incr/";
    mkdirSync(join(cwd, prefix), { recursive: true });
    writeFileSync(join(cwd, prefix, "0001_first.sql"), "SELECT 1;\n");
    git("add", "."); git("commit", "-m", "base"); const base = git("rev-parse", "HEAD");
    const commit = () => { git("add", "-A"); git("commit", "-m", "change"); };
    writeFileSync(join(cwd, prefix, "0002_next.sql"), "SELECT 2;\n"); commit();
    assert.deepEqual(changedExistingIncrements(base, "HEAD", cwd), []);
    writeFileSync(join(cwd, prefix, "0001_first.sql"), "SELECT 1; -- comment only\n"); commit();
    assert.deepEqual(changedExistingIncrements(base, "HEAD", cwd), [prefix + "0001_first.sql"]);
    git("reset", "--hard", base);
    renameSync(join(cwd, prefix, "0001_first.sql"), join(cwd, prefix, "0003_renamed.sql")); commit();
    assert.deepEqual(changedExistingIncrements(base, "HEAD", cwd), [prefix + "0001_first.sql"]);
    git("reset", "--hard", base);
    rmSync(join(cwd, prefix, "0001_first.sql")); commit();
    assert.deepEqual(changedExistingIncrements(base, "HEAD", cwd), [prefix + "0001_first.sql"]);
    assert.throws(() => changedExistingIncrements("missing-revision", "HEAD", cwd));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
