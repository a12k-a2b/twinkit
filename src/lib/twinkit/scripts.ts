/** Downloadable shell scripts + skill text.
 *  Canonical copies live in public/twinkit/*.sh (imported ?raw so they cannot drift).
 */
import { TWINKIT_VERSION } from "./types";
import TWIN_DISCOVER_SH_RAW from "../../../public/twinkit/twin-discover.sh?raw";
import TWIN_PACK_SH_RAW from "../../../public/twinkit/twin-pack.sh?raw";
import TWIN_UNPACK_SH_RAW from "../../../public/twinkit/twin-unpack.sh?raw";
import TWIN_VERIFY_SH_RAW from "../../../public/twinkit/twin-verify.sh?raw";

export const TWINKIT_SH_VERSION = TWINKIT_VERSION;

export const TWIN_DISCOVER_SH = TWIN_DISCOVER_SH_RAW;
export const TWIN_PACK_SH = TWIN_PACK_SH_RAW;
export const TWIN_UNPACK_SH = TWIN_UNPACK_SH_RAW;
export const TWIN_VERIFY_SH = TWIN_VERIFY_SH_RAW;

export const TWINKIT_SKILL_MD = `---
name: twinkit-migrate
description: >
  Migrate Claude Code / Codex Mac setups with TwinKit.
  Simple path: old Mac pack → new Mac unpack → verify → re-login.
metadata:
  short-description: "TwinKit ${TWINKIT_VERSION} Mac setup twin"
---

# TwinKit ${TWINKIT_VERSION}

Keep it simple:

1. On the **old Mac**: discover → pack (read SECRETS_REPORT if exit 2)
2. Copy the pack folder (SSD / AirDrop)
3. On the **new Mac**: unpack → re-login → permissions → verify
4. Load progress.json in TwinKit if you switch machines mid-run
5. "Doesn't apply" is the explicit OK to skip. "Skip for now" comes back later.

Scripts: twin-discover.sh, twin-pack.sh, twin-unpack.sh, twin-verify.sh
`;

export const TWINKIT_PROMPT_MD = `# TwinKit ${TWINKIT_VERSION}

Help me twin my Claude/Codex Mac setup. Keep steps short.
Old Mac: discover + pack. New Mac: unpack + re-auth + verify.
Never invent secrets. Prefer redacted configs.
`;

export const RAYCAST_SCRIPT = `#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title TwinKit
# @raycast.mode silent
# @raycast.packageName TwinKit
# Set TWINKIT_URL to your hosted checklist, or it opens the public repo.
open "\${TWINKIT_URL:-https://github.com/a12k-a2b/twinkit}"
`;

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown) {
  downloadText(filename, `${JSON.stringify(data, null, 2)}\n`);
}
