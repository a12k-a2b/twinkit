# TwinKit — send this to a friend

**Clone your Claude Code desk onto another Mac.**

1. On the old Mac:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/a12k-a2b/twinkit/main/install.sh | bash
   twin-discover
   twin-pack
   ```
2. AirDrop the `~/Desktop/twinkit-pack-*` folder (FileVault SSD is better than iCloud).
3. On the new Mac, same installer, then:
   ```bash
   twin-unpack --dry-run ~/Desktop/twinkit-pack-*
   twin-unpack           ~/Desktop/twinkit-pack-*
   twin-verify           ~/Desktop/twinkit-pack-*
   ```
4. Open the checklist: https://a12k-a2b.github.io/twinkit/
5. You still sign into Claude, Codex, Chrome, and click Allow on Accessibility.

Repo: https://github.com/a12k-a2b/twinkit
