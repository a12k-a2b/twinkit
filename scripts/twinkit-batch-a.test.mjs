import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const unpack = join(root, "public/twinkit/twin-unpack.sh");
const pack = join(root, "public/twinkit/twin-pack.sh");
const discover = join(root, "public/twinkit/twin-discover.sh");
const verify = join(root, "public/twinkit/twin-verify.sh");
const bash = process.env.TWINKIT_BASH || "/bin/bash";

function withFakeRsync(env) {
  const bin = mkdtempSync(join(tmpdir(), "tk-bin-"));
  writeFileSync(
    join(bin, "rsync"),
    `#!/usr/bin/env bash
set -e
args=("$@")
dest="\${args[\${#args[@]}-1]}"
src="\${args[\${#args[@]}-2]}"
mkdir -p "\$dest"
if [[ "\$src" == */ ]]; then
  cp -a "\$src". "\$dest" 2>/dev/null || cp -a "\$src" "\$dest"
else
  cp -a "\$src" "\$dest"
fi
`,
  );
  spawnSync("chmod", ["+x", join(bin, "rsync")]);
  return { ...env, PATH: `${bin}:${env.PATH || process.env.PATH}` };
}


function run(file, args, env, cwd) {
  return spawnSync(bash, [file, ...args], {
    env: { ...process.env, ...env },
    cwd,
    encoding: "utf8",
  });
}

describe("A1 unpack has no eval", () => {
  it("source does not contain eval", () => {
    const src = readFileSync(unpack, "utf8");
    assert.doesNotMatch(src, /\beval\b/);
  });

  it("malicious filename does not create pwned (SAFE)", () => {
    const packDir = mkdtempSync(join(tmpdir(), "tk-pack-"));
    const home = mkdtempSync(join(tmpdir(), "tk-home-"));
    mkdirSync(join(packDir, "dotfiles"));
    const evil = join(packDir, "dotfiles", "a' ; touch pwned ; :");
    writeFileSync(evil, "x");
    const cwd = mkdtempSync(join(tmpdir(), "tk-cwd-"));
    const res = run(unpack, [packDir], { HOME: home }, cwd);
    const pwnedHome = existsSync(join(home, "pwned"));
    const pwnedCwd = existsSync(join(cwd, "pwned"));
    const pwnedPack = existsSync(join(packDir, "pwned"));
    if (pwnedHome || pwnedCwd || pwnedPack) {
      console.log("stdout", res.stdout);
      console.log("stderr", res.stderr);
    }
    assert.equal(pwnedHome || pwnedCwd || pwnedPack, false, "RCE-STILL-PRESENT");
    // round-trip a normal file
    writeFileSync(join(packDir, "dotfiles", ".zshrc"), "export HI=1\n");
    run(unpack, [packDir], { HOME: home }, cwd);
    assert.equal(existsSync(join(home, ".zshrc.twinkit-new")), true);
  });

  it("rejects extra positionals", () => {
    const a = mkdtempSync(join(tmpdir(), "tk-a-"));
    const b = mkdtempSync(join(tmpdir(), "tk-b-"));
    const res = run(unpack, [a, b], { HOME: mkdtempSync(join(tmpdir(), "tk-h-")) }, root);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr + res.stdout, /extra argument|Usage/);
  });
});

describe("A2 discover empty-array + no-match grep", () => {
  it("empty-array guard", () => {
    const res = spawnSync(bash, ["-c", 'set -euo pipefail; A=(); for d in ${A[@]+"${A[@]}"}; do :; done; echo GUARD-OK'], {
      encoding: "utf8",
    });
    assert.equal(res.stdout.trim(), "GUARD-OK");
    assert.equal(res.status, 0);
  });

  it("discover exits 0 with valid JSON when no env matches and no daylight dirs", () => {
    const home = mkdtempSync(join(tmpdir(), "tk-disc-home-"));
    const out = mkdtempSync(join(tmpdir(), "tk-disc-out-"));
    const res = spawnSync(
      bash,
      [discover],
      {
        env: {
          PATH: process.env.PATH,
          HOME: home,
          TWINKIT_DISCOVER_OUT: out,
        },
        encoding: "utf8",
      },
    );
    assert.equal(res.status, 0, res.stderr + res.stdout);
    const inv = JSON.parse(readFileSync(join(out, "INVENTORY.json"), "utf8"));
    assert.equal(inv.twinkit, "0.6.0");
    assert.ok(Array.isArray(inv.dirs.daylight));
  });
});

describe("A3 Codex path mapping", () => {
  it("restores home-dot-codex and config-codex to distinct origins", () => {
    const p = mkdtempSync(join(tmpdir(), "tk-codex-pack-"));
    const h = mkdtempSync(join(tmpdir(), "tk-codex-home-"));
    mkdirSync(join(p, "codex/home-dot-codex"), { recursive: true });
    mkdirSync(join(p, "codex/config-codex"), { recursive: true });
    writeFileSync(join(p, "codex/home-dot-codex/marker"), "home");
    writeFileSync(join(p, "codex/config-codex/marker"), "cfg");
    const res = run(unpack, [p], { HOME: h }, h);
    if (!existsSync(join(h, ".codex/marker"))) {
      console.log("stdout", res.stdout, "stderr", res.stderr);
    }
    assert.equal(readFileSync(join(h, ".codex/marker"), "utf8"), "home");
    assert.equal(readFileSync(join(h, ".config/codex/marker"), "utf8"), "cfg");
  });
});

describe("A4 secrets fail-closed and not persisted as values", () => {
  it("README does not claim keys never get cloned", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    assert.equal(/never/i.test(readme), false, "REVIEW-README-WORDING");
  });

  it("sentinel is not left in $OUT; report has no secret text", () => {
    const home = mkdtempSync(join(tmpdir(), "tk-sec-home-"));
    const out = mkdtempSync(join(tmpdir(), "tk-sec-out-"));
    mkdirSync(join(home, ".claude"), { recursive: true });
    const sentinel = "sk-AAAAAAAAAAAAAAAA";
    writeFileSync(join(home, ".claude", "notes.md"), `token ${sentinel}\n`);
    const res = spawnSync(bash, [pack], {
      env: withFakeRsync({
        HOME: home,
        TWINKIT_OUT: out,
        PATH: process.env.PATH,
      }),
      encoding: "utf8",
    });
    assert.equal(res.status, 2, res.stdout + res.stderr);
    assert.equal(existsSync(out), false, "pack dir should be moved");
    const unsafe = `${out}-UNSAFE-DO-NOT-TRANSFER`;
    assert.equal(existsSync(unsafe), true);
    const report = readFileSync(join(unsafe, "SECRETS_REPORT.md"), "utf8");
    assert.doesNotMatch(report, new RegExp(sentinel));
    // original OUT path has no files containing sentinel
    const leaked = spawnSync("grep", ["-R", sentinel, out], { encoding: "utf8" });
    assert.notEqual(leaked.status, 0);
  });
});

describe("B4 verify extra args", () => {
  it("twin-verify.sh A B exits non-zero", () => {
    const a = mkdtempSync(join(tmpdir(), "tk-va-"));
    const b = mkdtempSync(join(tmpdir(), "tk-vb-"));
    const res = run(verify, [a, b], { HOME: mkdtempSync(join(tmpdir(), "tk-vh-")) }, root);
    assert.notEqual(res.status, 0);
  });
});
