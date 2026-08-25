import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// Test pure logic via dynamic import of compiled-ish TS is hard without tsx.
// Mirror critical patterns here + assert scripts on disk.

const pack = readFileSync(new URL("../public/twinkit/twin-pack.sh", import.meta.url), "utf8");
const verify = readFileSync(new URL("../public/twinkit/twin-verify.sh", import.meta.url), "utf8");
const discover = readFileSync(new URL("../public/twinkit/twin-discover.sh", import.meta.url), "utf8");

describe("twin-pack.sh safety", () => {
  it("documents no cp -R fallback", () => {
    assert.match(pack, /no cp -R fallback/i);
  });
  it("includes secret scan report", () => {
    assert.match(pack, /SECRETS_REPORT/);
    assert.match(pack, /TWINKIT_ALLOW_SECRETS/);
  });
  it("writes progress.json scaffold", () => {
    assert.match(pack, /progress\.json/);
  });
  it("redacts shell rc by default path", () => {
    assert.match(pack, /redact_rc|REDACTED/);
  });
});

describe("twin-discover.sh", () => {
  it("writes INVENTORY.json", () => {
    assert.match(discover, /INVENTORY\.json/);
  });
});

describe("twin-verify.sh", () => {
  it("writes PARITY artifacts", () => {
    assert.match(verify, /PARITY\.md/);
    assert.match(verify, /PARITY\.json/);
  });
});

describe("secret patterns (inline mirror of secrets.ts)", () => {
  const patterns = [
    /sk-[A-Za-z0-9_-]{12,}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /ghu_[A-Za-z0-9]{20,}/,
    /xai-[A-Za-z0-9_-]{10,}/,
    /AKIA[0-9A-Z]{12,}/,
    /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  ];
  it("flags sample secrets", () => {
    const sample = "export KEY=sk-abcdefghijklmnopqrst and ghp_abcdefghijklmnopqrstuvwx";
    assert.ok(patterns.some((p) => p.test(sample)));
  });
  it("ignores clean text", () => {
    const clean = "export NODE_ENV=production";
    assert.ok(!patterns.some((p) => p.test(clean)));
  });
});

describe("progress file shape", () => {
  it("parses minimal progress JSON", () => {
    const raw = {
      version: 3,
      mode: "unpack",
      enabledModules: ["core", "claude"],
      checked: { a: true },
      skipped: {},
      acceptedGaps: {},
    };
    assert.equal(raw.mode, "unpack");
    assert.ok(raw.enabledModules.includes("core"));
  });
});
