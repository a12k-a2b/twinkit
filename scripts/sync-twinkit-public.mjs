/**
 * Drift check: public/twinkit/*.sh is the source of truth.
 * src/lib/twinkit/scripts.ts must import them via ?raw (no embedded copies).
 *
 *   npm run sync:twinkit
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const scriptsTs = readFileSync(new URL("src/lib/twinkit/scripts.ts", root), "utf8");
const required = [
  "twin-discover.sh",
  "twin-pack.sh",
  "twin-unpack.sh",
  "twin-verify.sh",
];

let failed = 0;
for (const name of required) {
  const importNeedle = `public/twinkit/${name}?raw`;
  if (!scriptsTs.includes(importNeedle)) {
    console.error("missing ?raw import for", name);
    failed++;
  }
  try {
    readFileSync(new URL(`public/twinkit/${name}`, root));
  } catch {
    console.error("missing file public/twinkit/" + name);
    failed++;
  }
}
if (scriptsTs.includes("eval ")) {
  console.error("scripts.ts still mentions eval — unpack must not eval");
  failed++;
}
if (failed) process.exit(1);
console.log("ok: public/twinkit/*.sh is canonical; scripts.ts imports ?raw");
console.log("cwd", pathToFileURL(process.cwd()).href);
