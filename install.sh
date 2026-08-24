#!/usr/bin/env bash
# TwinKit installer — the four Mac scripts. No Node required.
#   curl -fsSL https://raw.githubusercontent.com/a12k-a2b/twinkit/main/install.sh | bash
set -euo pipefail

DEST="${TWINKIT_HOME:-$HOME/.twinkit}"
BIN="${TWINKIT_BIN:-$HOME/.local/bin}"
BASE="${TWINKIT_BASE:-https://raw.githubusercontent.com/a12k-a2b/twinkit/main/public/twinkit}"
APP_URL="https://a12k-a2b.github.io/twinkit/"

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
)

for f in "${files[@]}"; do
  printf "  %s\n" "$f"
  curl -fsSL "$BASE/$f" -o "$DEST/$f"
done

chmod +x "$DEST"/twin-*.sh "$DEST"/raycast.sh

for s in twin-discover twin-pack twin-unpack twin-verify; do
  ln -sfn "$DEST/$s.sh" "$BIN/$s"
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
echo "Checklist (browser, no install):"
echo "  $APP_URL"
echo
echo "If $BIN is not on PATH yet, add this to ~/.zshrc:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
