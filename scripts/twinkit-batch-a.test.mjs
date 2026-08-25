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
    const hits = readFileSync(join(unsafe, "scan/hits.txt"), "utf8");
    assert.doesNotMatch(hits, new RegExp(sentinel));
  });
});

function packWithFakeRsync(home, out) {
  return spawnSync(bash, [pack], {
    env: withFakeRsync({ HOME: home, TWINKIT_OUT: out, PATH: process.env.PATH }),
    encoding: "utf8",
  });
}

function assertQuarantinedSecret(out, res, sentinel) {
  assert.equal(res.status, 2, res.stdout + res.stderr);
  assert.equal(existsSync(out), false, "SECRET-SHIPPED");
  const unsafe = `${out}-UNSAFE-DO-NOT-TRANSFER`;
  assert.equal(existsSync(unsafe), true);
  const report = readFileSync(join(unsafe, "SECRETS_REPORT.md"), "utf8");
  const hits = readFileSync(join(unsafe, "scan/hits.txt"), "utf8");
  assert.doesNotMatch(report, new RegExp(sentinel));
  assert.doesNotMatch(hits, new RegExp(sentinel));
}

describe("A.2 scanner skips only generated root artifacts", () => {
  const sentinel = "sk-AAAAAAAAAAAAAAAA";

  for (const name of ["hits.txt", "SECRETS_REPORT.md", "THREAT_MODEL.md"]) {
    it(`scans a copied source file named ${name}`, () => {
      const home = mkdtempSync(join(tmpdir(), "tk-a2-home-"));
      const out = join(mkdtempSync(join(tmpdir(), "tk-a2-out-")), "p");
      mkdirSync(join(home, ".claude"), { recursive: true });
      writeFileSync(join(home, ".claude", name), `token ${sentinel}\n`);
      const res = packWithFakeRsync(home, out);
      assertQuarantinedSecret(out, res, sentinel);
    });
  }

  it("scans files inside a nested source directory named scan/", () => {
    const home = mkdtempSync(join(tmpdir(), "tk-a2-scan-home-"));
    const out = join(mkdtempSync(join(tmpdir(), "tk-a2-scan-out-")), "p");
    mkdirSync(join(home, ".claude/scan"), { recursive: true });
    writeFileSync(join(home, ".claude/scan/x.txt"), `token ${sentinel}\n`);
    const res = packWithFakeRsync(home, out);
    assertQuarantinedSecret(out, res, sentinel);
  });
});

describe("A.1 fail-closed staging", () => {
  it("scanner-write poison at $OUT quarantines (FAIL-CLOSED-OK)", () => {
    const home = mkdtempSync(join(tmpdir(), "tk-a1a-home-"));
    const parent = mkdtempSync(join(tmpdir(), "tk-a1a-parent-"));
    const out = join(parent, "twinkit-pack-a");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude/notes.md"), "clean\n");
    mkdirSync(join(out, "scan/hits.txt"), { recursive: true });
    spawnSync(bash, [pack], {
      env: withFakeRsync({ HOME: home, TWINKIT_OUT: out, PATH: process.env.PATH }),
      encoding: "utf8",
    });
    const plain = existsSync(out);
    const unsafe = existsSync(`${out}-UNSAFE-DO-NOT-TRANSFER`);
    assert.equal(plain && !unsafe, false, "FAIL-OPEN");
  });

  it("unreadable file does not leave a plain pack", () => {
    const home = mkdtempSync(join(tmpdir(), "tk-a1b-home-"));
    const out = join(mkdtempSync(join(tmpdir(), "tk-a1b-parent-")), "twinkit-pack-b");
    mkdirSync(join(home, ".claude"), { recursive: true });
    const secret = join(home, ".claude/secret.txt");
    writeFileSync(secret, "x");
    chmodSync(secret, 0);
    spawnSync(bash, [pack], {
      env: withFakeRsync({ HOME: home, TWINKIT_OUT: out, PATH: process.env.PATH }),
      encoding: "utf8",
    });
    chmodSync(secret, 0o644);
    assert.equal(existsSync(out), false, "LEFT-UNSCANNED-PACK");
  });

  it("clean home produces a real $OUT with no-hits report", () => {
    const home = mkdtempSync(join(tmpdir(), "tk-clean-home-"));
    const out = join(mkdtempSync(join(tmpdir(), "tk-clean-parent-")), "twinkit-pack-clean");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude/notes.md"), "hello\n");
    const res = spawnSync(bash, [pack], {
      env: withFakeRsync({ HOME: home, TWINKIT_OUT: out, PATH: process.env.PATH }),
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.equal(existsSync(out), true);
    const report = readFileSync(join(out, "SECRETS_REPORT.md"), "utf8");
    assert.match(report, /No pattern hits/);
  });

  it("preserves existing progress.json unless --reset", () => {
    const home = mkdtempSync(join(tmpdir(), "tk-prog-home-"));
    const out = join(mkdtempSync(join(tmpdir(), "tk-prog-parent-")), "twinkit-pack-p");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude/notes.md"), "hello\n");
    const first = spawnSync(bash, [pack], {
      env: withFakeRsync({ HOME: home, TWINKIT_OUT: out, PATH: process.env.PATH }),
      encoding: "utf8",
    });
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const marker = { version: 4, twinkit: "0.6.0", checked: { keepme: true } };
    writeFileSync(join(out, "progress.json"), JSON.stringify(marker));
    const second = spawnSync(bash, [pack], {
      env: withFakeRsync({ HOME: home, TWINKIT_OUT: out, PATH: process.env.PATH }),
      encoding: "utf8",
    });
    assert.equal(second.status, 0, second.stdout + second.stderr);
    const kept = JSON.parse(readFileSync(join(out, "progress.json"), "utf8"));
    assert.equal(kept.checked.keepme, true);
  });
});

describe("A.1 verify exits nonzero on real fails", () => {
  it("missing required tool -> nonzero", () => {
    const p = mkdtempSync(join(tmpdir(), "tk-ver-p-"));
    writeFileSync(join(p, "MANIFEST.md"), "# MANIFEST\n- git: git version 2.0\n");
    mkdirSync(join(p, "claude"));
    const bin = mkdtempSync(join(tmpdir(), "tk-ver-bin-"));
    for (const t of ["bash", "sed", "grep", "awk", "date", "python3", "head", "tr", "wc", "ls", "cat", "mkdir"]) {
      const src = spawnSync("bash", ["-c", `command -v ${t}`], { encoding: "utf8" }).stdout.trim();
      if (src) spawnSync("ln", ["-sf", src, join(bin, t)]);
    }
    const res = spawnSync(bash, [verify, p], {
      env: { HOME: mkdtempSync(join(tmpdir(), "tk-ver-h-")), PATH: bin },
      encoding: "utf8",
    });
    assert.notEqual(res.status, 0, `missing-tool-exit=${res.status}\n${res.stdout}${res.stderr}`);
  });

  it("empty satisfied pack exits 0", () => {
    const p = mkdtempSync(join(tmpdir(), "tk-ver-ok-"));
    writeFileSync(join(p, "MANIFEST.md"), "# MANIFEST\n- git: (not found)\n");
    const res = run(verify, [p], { HOME: mkdtempSync(join(tmpdir(), "tk-ver-okh-")) }, root);
    assert.equal(res.status, 0, res.stdout + res.stderr);
  });
});

describe("A.1 version + raycast source of truth", () => {
  it("no 0.5.x leftovers in public/src/README/package.json", () => {
    const files = [
      "public/twinkit/prompt.md",
      "public/twinkit/SKILL.md",
      "src/lib/twinkit/types.ts",
      "README.md",
    ];
    for (const f of files) {
      const body = readFileSync(join(root, f), "utf8");
      assert.doesNotMatch(body, /0\.5\.[0-9]/, f);
    }
  });

  it("scripts.ts imports raycast.sh via ?raw", () => {
    const body = readFileSync(join(root, "src/lib/twinkit/scripts.ts"), "utf8");
    assert.match(body, /public\/twinkit\/raycast\.sh\?raw/);
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
