#!/usr/bin/env bash
# TwinKit unpack 0.5.0
set -euo pipefail
DRY=0; PACK=""
for arg in "$@"; do case "$arg" in --dry-run) DRY=1 ;; *) PACK="$arg" ;; esac; done
[[ -n "$PACK" && -d "$PACK" ]] || { echo "Usage: bash twin-unpack.sh [--dry-run] PACK"; exit 1; }
PACK=$(cd "$PACK" && pwd)
echo "==> unpack 0.5.0 $PACK dry=$DRY"
run() { if [[ "$DRY" -eq 1 ]]; then echo "DRY: $*"; else eval "$@"; fi; }
backup() {
  local t="$1"
  if [[ -e "$t" && ! -e "${t}.twinkit-backup" ]]; then
    [[ "$DRY" -eq 1 ]] && echo "DRY: backup $t" || cp -a "$t" "${t}.twinkit-backup"
  fi
}
if ! command -v brew >/dev/null 2>&1; then echo "!! install Homebrew first"; else
  [[ -f "$PACK/brew/Brewfile" ]] && { [[ "$DRY" -eq 1 ]] && echo DRY brew bundle || brew bundle --file="$PACK/brew/Brewfile" || true; }
fi
if [[ -d "$PACK/dotfiles" ]]; then
  for f in "$PACK/dotfiles"/.* "$PACK/dotfiles"/*; do
    [[ -f "$f" ]] || continue
    base=$(basename "$f")
    [[ "$base" == "ssh-public" || "$base" == "git-global.ini" ]] && continue
    backup "$HOME/$base"; run "cp '$f' '$HOME/$base.twinkit-new'"
  done
fi
if [[ -d "$PACK/claude" ]]; then
  run "mkdir -p '$HOME/.claude'"; backup "$HOME/.claude"
  command -v rsync >/dev/null && run "rsync -a '$PACK/claude/' '$HOME/.claude/'" || echo "!! need rsync"
fi
if [[ -d "$PACK/codex" ]]; then
  for d in "$PACK/codex"/*; do
    [[ -d "$d" ]] || continue
    dest="$HOME/.$(basename "$d")"; [[ "$(basename "$d")" == "codex" ]] && dest="$HOME/.codex"
    run "mkdir -p '$dest'"; backup "$dest"
    command -v rsync >/dev/null && run "rsync -a '$d/' '$dest/'"
  done
fi
if [[ -f "$PACK/progress.json" && "$DRY" -eq 0 ]]; then
  python3 - << PY
import json,time
from pathlib import Path
p=Path("$PACK/progress.json")
try: data=json.loads(p.read_text())
except Exception: data={"version":3}
data["packLabel"]=Path("$PACK").name
data["unpackedAt"]=time.strftime("%Y-%m-%dT%H:%M:%S")
p.write_text(json.dumps(data,indent=2)+"\n")
print("updated progress.json")
PY
fi
echo "Next: load progress.json in TwinKit; bash twin-verify.sh $PACK"
