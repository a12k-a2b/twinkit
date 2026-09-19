import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = join(root, "sync");

describe("TwinKit Sync", () => {
  it("ships the python package and launchd templates", () => {
    assert.equal(existsSync(join(pkg, "twinkit_sync", "cli.py")), true);
    assert.equal(existsSync(join(pkg, "launchd", "com.twinkit.sync.idle.plist")), true);
    assert.equal(existsSync(join(pkg, "launchd", "com.twinkit.sync.nightly.plist")), true);
    assert.equal(existsSync(join(root, "docs", "SYNC.md")), true);
  });

  it("unit tests: path rewrite, lock, idle, bounce", () => {
    const res = spawnSync(
      "python3",
      ["-m", "unittest", "discover", "-s", "sync/tests", "-p", "test_*.py", "-v"],
      { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONPATH: pkg } },
    );
    if (res.status !== 0) {
      console.log(res.stdout);
      console.log(res.stderr);
    }
    assert.equal(res.status, 0, res.stderr || res.stdout);
  });
});
