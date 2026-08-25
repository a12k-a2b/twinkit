#!/usr/bin/env bash
# TwinKit unpack 0.6.0
# argv-only restore. Pack-controlled names are not executed as shell.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "!! python3 required before unpack mutates this Mac." >&2
  exit 1
fi

DRY=0
BREW=0
PACK=""
usage() {
  echo "Usage: bash twin-unpack.sh [--dry-run] [--brew] PACK" >&2
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --brew) BREW=1 ;;
    -h|--help) usage ;;
    --*) echo "Unknown option: $arg" >&2; usage ;;
    *)
      if [[ -n "$PACK" ]]; then
        echo "!! extra argument: $arg" >&2
        usage
      fi
      PACK="$arg"
      ;;
  esac
done

[[ -n "$PACK" && -d "$PACK" ]] || usage
PACK=$(cd "$PACK" && pwd)
echo "==> unpack 0.6.0 $PACK dry=$DRY brew=$BREW"

run() {
  if [[ "$DRY" -eq 1 ]]; then
    printf 'DRY:'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

copy_tree() {
  local src="$1" dest="$2"
  if command -v rsync >/dev/null 2>&1; then
    run rsync -a "$src" "$dest"
  else
    run mkdir -p -- "$dest"
    if [[ "$DRY" -eq 1 ]]; then
      printf 'DRY: cp -a %q %q\n' "$src" "$dest"
    else
      cp -a "$src". "$dest" 2>/dev/null || cp -a "$src" "$dest"
    fi
  fi
}


backup() {
  local t="$1"
  if [[ -e "$t" && ! -e "${t}.twinkit-backup" ]]; then
    if [[ "$DRY" -eq 1 ]]; then
      echo "DRY: backup $t"
    else
      cp -a "$t" "${t}.twinkit-backup"
    fi
  fi
}

if [[ "$BREW" -eq 1 ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "!! --brew set but Homebrew is missing"
  elif [[ -f "$PACK/brew/Brewfile" ]]; then
    if [[ "$DRY" -eq 1 ]]; then
      echo "DRY: brew bundle --file=$PACK/brew/Brewfile"
    else
      brew bundle --file="$PACK/brew/Brewfile" || true
    fi
  fi
elif [[ -f "$PACK/brew/Brewfile" ]]; then
  echo "note: Brewfile present. Re-run with --brew to apply it (opt-in)."
fi

if [[ -d "$PACK/dotfiles" ]]; then
  for f in "$PACK/dotfiles"/.* "$PACK/dotfiles"/*; do
    [[ -e "$f" ]] || continue
    [[ -f "$f" ]] || continue
    base=$(basename "$f")
    [[ "$base" == "." || "$base" == ".." ]] && continue
    [[ "$base" == "ssh-public" || "$base" == "git-global.ini" ]] && continue
    backup "$HOME/$base"
    run cp -- "$f" "$HOME/$base.twinkit-new"
  done
fi

if [[ -d "$PACK/claude" ]]; then
  run mkdir -p -- "$HOME/.claude"
  backup "$HOME/.claude"
  copy_tree "$PACK/claude/" "$HOME/.claude/"
fi

if [[ -d "$PACK/codex/home-dot-codex" ]]; then
  run mkdir -p -- "$HOME/.codex"
  backup "$HOME/.codex"
  copy_tree "$PACK/codex/home-dot-codex/" "$HOME/.codex/"
fi

if [[ -d "$PACK/codex/config-codex" ]]; then
  run mkdir -p -- "$HOME/.config/codex"
  backup "$HOME/.config/codex"
  copy_tree "$PACK/codex/config-codex/" "$HOME/.config/codex/"
fi

if [[ -f "$PACK/progress.json" && "$DRY" -eq 0 ]]; then
  PACK="$PACK" python3 - <<'PY'
import json, os, time
from pathlib import Path
p = Path(os.environ["PACK"]) / "progress.json"
try:
    data = json.loads(p.read_text())
except Exception:
    data = {"version": 4}
data["packLabel"] = p.parent.name
data["unpackedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
p.write_text(json.dumps(data, indent=2) + "\n")
print("updated progress.json")
PY
fi

echo "Next: load progress.json in TwinKit; bash twin-verify.sh $PACK"
