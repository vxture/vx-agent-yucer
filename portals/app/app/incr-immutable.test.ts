import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { changedExistingIncrements, checkIncrementHistory } from "../../../scripts/guardrails/check-incr-immutable.mjs";

test("allows new increments but rejects edits, deletions and renames of existing SQL", () => {
  const cwd = mkdtempSync(join(tmpdir(), "yucer-ddl-"));
  const git = (...args: string[]) => execFileSync("/usr/bin/git", args, { cwd, stdio: "pipe" }).toString().trim();
  try {
    git("init"); git("config", "user.name", "test"); git("config", "user.email", "test@example.invalid");
    const prefix = "deploy/database/ddl/incr/";
    mkdirSync(join(cwd, prefix), { recursive: true });
    writeFileSync(join(cwd, prefix, "0001_first.sql"), "SELECT 1;\n");
    git("add", "."); git("commit", "-m", "base"); const base = git("rev-parse", "HEAD");
    const commit = () => { git("add", "-A"); git("commit", "-m", "change"); };
    writeFileSync(join(cwd, prefix, "0002_next.sql"), "SELECT 2;\n"); commit();
    assert.deepEqual(changedExistingIncrements(base, "HEAD", cwd), []);
    assert.equal(checkIncrementHistory(base, cwd).ok, true);
    assert.throws(() => checkIncrementHistory(undefined, cwd));
    const script = fileURLToPath(new URL("../../../scripts/guardrails/check-incr-immutable.mjs", import.meta.url));
    assert.match(execFileSync(process.execPath, [script, base], { cwd, encoding: "utf8" }), /OK/);
    assert.throws(() => execFileSync(process.execPath, [script], { cwd, stdio: "pipe" }));
    writeFileSync(join(cwd, prefix, "0001_first.sql"), "SELECT 1; -- comment only\n"); commit();
    assert.deepEqual(changedExistingIncrements(base, "HEAD", cwd), [prefix + "0001_first.sql"]);
    assert.equal(checkIncrementHistory(base, cwd).ok, false);
    assert.throws(() => execFileSync(process.execPath, [script, base], { cwd, stdio: "pipe" }));
    git("reset", "--hard", base);
    renameSync(join(cwd, prefix, "0001_first.sql"), join(cwd, prefix, "0003_renamed.sql")); commit();
    assert.deepEqual(changedExistingIncrements(base, "HEAD", cwd), [prefix + "0001_first.sql"]);
    git("reset", "--hard", base);
    rmSync(join(cwd, prefix, "0001_first.sql")); commit();
    assert.deepEqual(changedExistingIncrements(base, "HEAD", cwd), [prefix + "0001_first.sql"]);
    assert.throws(() => changedExistingIncrements("missing-revision", "HEAD", cwd));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
