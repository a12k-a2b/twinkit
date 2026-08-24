#!/usr/bin/env bash
# TwinKit pack 0.5.0
# no cp -R fallback — rsync required
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M)
OUT="${TWINKIT_OUT:-$HOME/Desktop/twinkit-pack-$STAMP}"
mkdir -p "$OUT"/{dotfiles,claude,codex,gradle,android,daylight,notes,brew,bin-meta,scan}

echo "==> TwinKit pack 0.5.0 → $OUT"

rsync_safe() {
  local src="$1"; shift
  local dest="$1"; shift
  if ! command -v rsync >/dev/null 2>&1; then
    echo "!! rsync required (no cp -R fallback). brew install rsync" >&2
    return 1
  fi
  mkdir -p "$dest"
  rsync -a "$@" "$src" "$dest"
}

{
  echo "# TwinKit MANIFEST"
  echo "Packed: $(date -Iseconds 2>/dev/null || date)"
  echo "TwinKit: 0.5.0"
  echo "Host: $(scutil --get ComputerName 2>/dev/null || hostname)"
  echo "Arch: $(uname -m)"
  echo "macOS: $(sw_vers -productVersion 2>/dev/null || true)"
  echo
  echo "## Tool versions"
  for c in brew git node npm npx java adb claude codex grok muse gh python3; do
    if command -v "$c" >/dev/null 2>&1; then
      echo -n "- $c: "
      "$c" --version 2>/dev/null | head -1 || "$c" -v 2>/dev/null | head -1 || echo "(present)"
    else
      echo "- $c: (not found)"
    fi
  done
  echo
  echo "## Important env (names only)"
  env | grep -E '^(ANDROID_|JAVA_|GRADLE_|CLAUDE_|OPENAI_|GROK_|MUSE_)' | sed 's/=.*$/=…/' || true
} > "$OUT/MANIFEST.md"

if [[ -f "${TWINKIT_INVENTORY:-}" ]]; then
  cp "$TWINKIT_INVENTORY" "$OUT/INVENTORY.json" || true
fi

redact_rc() {
  local src="$1" dest="$2"
  sed -E \
    -e 's/(api[_-]?key|token|secret|password|passwd|auth)[[:space:]]*=[[:space:]]*[^[:space:]]+/\1=…/Ig' \
    -e 's/(sk-[A-Za-z0-9_-]{10,})/sk-…REDACTED…/g' \
    -e 's/(ghp_[A-Za-z0-9]{20,})/ghp_…REDACTED…/g' \
    -e 's/(github_pat_[A-Za-z0-9_]{20,})/github_pat_…REDACTED…/g' \
    -e 's/(AKIA[0-9A-Z]{12,})/AKIA…REDACTED…/g' \
    -e 's/(xox[baprs]-[A-Za-z0-9-]{10,})/xox…REDACTED…/g' \
    -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._\-]{10,}/\1…REDACTED…/g' \
    "$src" > "$dest"
}

for f in .zshrc .zprofile .zshenv .bashrc .bash_profile .profile .zalias; do
  if [[ -f "$HOME/$f" ]]; then
    if [[ "${TWINKIT_PACK_RAW_RC:-0}" == "1" ]]; then
      cp "$HOME/$f" "$OUT/dotfiles/$f"
    else
      redact_rc "$HOME/$f" "$OUT/dotfiles/$f"
      echo "Redacted $f" >> "$OUT/notes/rc-policy.txt"
    fi
  fi
done

command -v git >/dev/null 2>&1 && git config --global --list > "$OUT/dotfiles/git-global.ini" 2>/dev/null || true

if command -v brew >/dev/null 2>&1; then
  brew bundle dump --file="$OUT/brew/Brewfile" --force 2>/dev/null || true
  brew list --formula > "$OUT/brew/formulae.txt" 2>/dev/null || true
  brew list --cask > "$OUT/brew/casks.txt" 2>/dev/null || true
fi

if [[ -d "$HOME/.claude" ]]; then
  rsync_safe "$HOME/.claude/" "$OUT/claude/" \
    --exclude 'cache' --exclude 'caches' --exclude '*.key' \
    --exclude 'statsig' --exclude 'telemetry' \
    --exclude '*credentials*' --exclude '*secret*' --exclude '*token*' \
    --exclude '.credentials.json' --exclude 'session*'
fi
command -v mdfind >/dev/null 2>&1 && mdfind -name 'CLAUDE.md' 2>/dev/null | head -80 > "$OUT/notes/claude-md-paths.txt" || true

for d in "$HOME/.codex" "$HOME/.config/codex"; do
  if [[ -d "$d" ]]; then
    base=$(basename "$d")
    rsync_safe "$d/" "$OUT/codex/$base/" \
      --exclude '*auth*' --exclude '*credential*' --exclude '*token*' --exclude '*.key'
  fi
done

if [[ -d "$HOME/.gradle" ]]; then
  mkdir -p "$OUT/gradle"
  [[ -f "$HOME/.gradle/gradle.properties" ]] && redact_rc "$HOME/.gradle/gradle.properties" "$OUT/gradle/gradle.properties"
  [[ -d "$HOME/.gradle/init.d" ]] && rsync_safe "$HOME/.gradle/init.d/" "$OUT/gradle/init.d/"
fi

{
  echo "ANDROID_HOME=${ANDROID_HOME:-}"
  echo "ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-}"
  echo "JAVA_HOME=${JAVA_HOME:-}"
} > "$OUT/android/env-and-packages.txt" || true

DAYLIGHT_CANDIDATES=("$HOME/daylight" "$HOME/dc1" "$HOME/src/daylight" "$HOME/Developer/daylight")
while IFS= read -r d; do
  [[ -n "$d" ]] && DAYLIGHT_CANDIDATES+=("$d")
done <<EOF
$(find "$HOME" -maxdepth 3 -type d \( -iname '*daylight*' -o -iname '*dc1*' \) 2>/dev/null | head -20 || true)
EOF
for d in "${DAYLIGHT_CANDIDATES[@]}"; do
  if [[ -d "$d" ]]; then
    name=$(basename "$d")
    rsync_safe "$d/" "$OUT/daylight/$name/" \
      --exclude node_modules --exclude .git --exclude build --exclude .gradle \
      --exclude '*.keystore' --exclude '*secret*' --exclude '.env' --exclude '.env.*'
  fi
done

if [[ -d "$HOME/.ssh" ]]; then
  mkdir -p "$OUT/dotfiles/ssh-public"
  cp "$HOME/.ssh"/*.pub "$OUT/dotfiles/ssh-public/" 2>/dev/null || true
fi

cat > "$OUT/notes/HUMAN.md" << 'NOTE'
# Human notes
## Auth methods
## MCP secrets (names only)
## DC1 smoke
NOTE

cat > "$OUT/progress.json" << EOF
{
  "version": 3,
  "twinkit": "0.5.0",
  "exportedAt": "$(date -Iseconds 2>/dev/null || date)",
  "mode": "both",
  "enabledModules": ["core","claude","codex","grok","muse","android","daylight","chrome","permissions","ssh","transfer"],
  "checked": {},
  "skipped": {},
  "acceptedGaps": {},
  "checkedAt": {},
  "startedAt": null,
  "completedAt": null,
  "celebratedSections": [],
  "packLabel": "$(basename "$OUT")",
  "paused": false
}
EOF

REPORT="$OUT/SECRETS_REPORT.md"
FINDINGS=0
{ echo "# SECRETS_REPORT"; echo "Scanned: $(date)"; echo; echo "## Matches"; } > "$REPORT"
: > "$OUT/scan/hits.txt"
for pat in 'sk-[A-Za-z0-9_-]{12,}' 'ghp_[A-Za-z0-9]{20,}' 'github_pat_[A-Za-z0-9_]{20,}' 'AKIA[0-9A-Z]{12,}' 'xox[baprs]-[A-Za-z0-9-]{10,}' '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----' 'Bearer [A-Za-z0-9._\-]{20,}'; do
  grep -R -I -n -E "$pat" "$OUT" --exclude=SECRETS_REPORT.md --exclude=hits.txt 2>/dev/null >> "$OUT/scan/hits.txt" || true
done
if [[ -s "$OUT/scan/hits.txt" ]]; then
  FINDINGS=$(wc -l < "$OUT/scan/hits.txt" | tr -d ' ')
  echo "Found $FINDINGS hit(s):" >> "$REPORT"
  head -40 "$OUT/scan/hits.txt" >> "$REPORT"
else
  echo "No pattern hits (not a guarantee)." >> "$REPORT"
fi

cat > "$OUT/THREAT_MODEL.md" << 'TM'
# Threat model
Sensitive config. Prefer FileVault SSD. Load progress.json in TwinKit UI.
TM

if [[ "$FINDINGS" != "0" && "${TWINKIT_ALLOW_SECRETS:-0}" != "1" ]]; then
  echo "!! SECRET SCAN: $FINDINGS hit(s). See $REPORT"
  exit 2
fi
echo "==> Done → $OUT"
