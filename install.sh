#!/usr/bin/env bash
# TwinKit installer — the four Mac scripts + TwinKit Sync. No Node required.
#   curl -fsSL https://raw.githubusercontent.com/a12k-a2b/twinkit/main/install.sh | bash
set -euo pipefail

DEST="${TWINKIT_HOME:-$HOME/.twinkit}"
BIN="${TWINKIT_BIN:-$HOME/.local/bin}"
BASE="${TWINKIT_BASE:-https://raw.githubusercontent.com/a12k-a2b/twinkit/main/public/twinkit}"
REPO_RAW="${TWINKIT_REPO_RAW:-https://raw.githubusercontent.com/a12k-a2b/twinkit/main}"
if ! command -v curl >/dev/null 2>&1; then
  echo "TwinKit needs curl." >&2
  exit 1
fi

echo "TwinKit → $DEST"
mkdir -p "$DEST" "$BIN"

files=(
  twin-discover.sh
  twin-pack.sh
  twin-unpack.sh
  twin-verify.sh
  SKILL.md
  prompt.md
  raycast.sh
  twinkit
  twinkit-sync
)

HERE=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fi

for f in "${files[@]}"; do
  printf "  %s\n" "$f"
  if [[ -n "$HERE" && -f "$HERE/public/twinkit/$f" ]]; then
    cp "$HERE/public/twinkit/$f" "$DEST/$f"
  else
    curl -fsSL "$BASE/$f" -o "$DEST/$f"
  fi
done

chmod +x "$DEST"/twin-*.sh "$DEST"/raycast.sh "$DEST"/twinkit "$DEST"/twinkit-sync

for s in twin-discover twin-pack twin-unpack twin-verify; do
  ln -sfn "$DEST/$s.sh" "$BIN/$s"
done
ln -sfn "$DEST/twinkit" "$BIN/twinkit"
ln -sfn "$DEST/twinkit-sync" "$BIN/twinkit-sync"

# TwinKit Sync python package → ~/.twinkit/sync-pkg/twinkit_sync
SYNC_PKG="$DEST/sync-pkg"
mkdir -p "$SYNC_PKG/twinkit_sync/adapters"
sync_py=(
  twinkit_sync/__init__.py
  twinkit_sync/__main__.py
  twinkit_sync/cli.py
  twinkit_sync/config.py
  twinkit_sync/exclusions.py
  twinkit_sync/paths.py
  twinkit_sync/lock.py
  twinkit_sync/idle.py
  twinkit_sync/apps.py
  twinkit_sync/host.py
  twinkit_sync/bounce.py
  twinkit_sync/vault.py
  twinkit_sync/pack.py
  twinkit_sync/doctor.py
  twinkit_sync/schedule.py
  twinkit_sync/adapters/__init__.py
  twinkit_sync/adapters/base.py
  twinkit_sync/adapters/cursor.py
  twinkit_sync/adapters/codex.py
  twinkit_sync/adapters/claude.py
  twinkit_sync/adapters/antigravity.py
)
for f in "${sync_py[@]}"; do
  printf "  sync/%s\n" "$f"
  destf="$SYNC_PKG/$f"
  mkdir -p "$(dirname "$destf")"
  if [[ -n "$HERE" && -f "$HERE/sync/$f" ]]; then
    cp "$HERE/sync/$f" "$destf"
  else
    curl -fsSL "$REPO_RAW/sync/$f" -o "$destf"
  fi
done
mkdir -p "$DEST/launchd"
for plist in com.twinkit.sync.idle.plist com.twinkit.sync.nightly.plist; do
  if [[ -n "$HERE" && -f "$HERE/sync/launchd/$plist" ]]; then
    cp "$HERE/sync/launchd/$plist" "$DEST/launchd/$plist"
  else
    curl -fsSL "$REPO_RAW/sync/launchd/$plist" -o "$DEST/launchd/$plist" || true
  fi
done

skill_dir="$HOME/.claude/skills/twinkit-migrate"
if [[ -d "$HOME/.claude" ]]; then
  mkdir -p "$skill_dir"
  cp "$DEST/SKILL.md" "$skill_dir/SKILL.md"
  echo "  Claude skill → $skill_dir/SKILL.md"
fi

echo
echo "Done."
echo
echo "  Scripts:  $DEST"
echo "  On PATH:  $BIN/twin-discover  (if $BIN is on your PATH)"
echo
echo "Old Mac:"
echo "  twin-discover && twin-pack"
echo
echo "New Mac (after you AirDrop the pack folder):"
echo "  twin-unpack --dry-run ~/Desktop/twinkit-pack-*"
echo "  twin-unpack           ~/Desktop/twinkit-pack-*"
echo "  twin-verify           ~/Desktop/twinkit-pack-*"
echo
echo "TwinKit Sync (2–3 Macs, exclusive lock + idle bounce):"
  echo "  twinkit sync init --machine air    # or mini / other"
  echo "  twinkit sync doctor"
  echo "  docs: https://github.com/a12k-a2b/twinkit/blob/main/docs/SYNC.md"
  echo
  echo "Checklist app:"
  echo "  git clone https://github.com/a12k-a2b/twinkit.git"
  echo "  cd twinkit && npm install && npm run dev"
  echo
  echo "If $BIN is not on PATH yet, add this to ~/.zshrc:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
