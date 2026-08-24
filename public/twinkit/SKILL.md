---
name: twinkit-migrate
description: >
  Migrate Claude Code / Codex Mac setups with TwinKit.
  Simple path: old Mac pack → new Mac unpack → verify → re-login.
metadata:
  short-description: "TwinKit 0.5.0 Mac setup twin"
---

# TwinKit 0.5.0

Keep it simple:

1. On the **old Mac**: discover → pack (read SECRETS_REPORT if exit 2)
2. Copy the pack folder (SSD / AirDrop)
3. On the **new Mac**: unpack → re-login → permissions → verify
4. Load progress.json in TwinKit if you switch machines mid-run
5. Skips need an explicit "OK to skip" before you're done

Scripts: twin-discover.sh, twin-pack.sh, twin-unpack.sh, twin-verify.sh
