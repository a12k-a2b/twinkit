#!/usr/bin/env bash
# TwinKit pack 0.6.0
# no cp -R fallback — rsync required
set -euo pipefail

if ! command -v rsync >/dev/null 2>&1; then
  echo "!! rsync required (no cp -R fallback). brew install rsync" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "!! python3 required for the secret scan." >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M)
OUT="${TWINKIT_OUT:-$HOME/Desktop/twinkit-pack-$STAMP}"
mkdir -p "$OUT"/{dotfiles,claude,codex,gradle,android,daylight,notes,brew,bin-meta,scan}

echo "==> TwinKit pack 0.6.0 → $OUT"

rsync_safe() {
  local src="$1"; shift
  local dest="$1"; shift
  mkdir -p "$dest"
  rsync -a "$@" "$src" "$dest"
}

{
  echo "# TwinKit MANIFEST"
  echo "Packed: $(date -Iseconds 2>/dev/null || date)"
  echo "TwinKit: 0.6.0"
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
    -e 's/(gho_[A-Za-z0-9]{20,})/gho_…REDACTED…/g' \
    -e 's/(ghu_[A-Za-z0-9]{20,})/ghu_…REDACTED…/g' \
    -e 's/(github_pat_[A-Za-z0-9_]{20,})/github_pat_…REDACTED…/g' \
    -e 's/(AKIA[0-9A-Z]{12,})/AKIA…REDACTED…/g' \
    -e 's/(xox[baprs]-[A-Za-z0-9-]{10,})/xox…REDACTED…/g' \
    -e 's/(xai-[A-Za-z0-9_-]{10,})/xai-…REDACTED…/g' \
    -e 's/(AIza[0-9A-Za-z_-]{20,})/AIza…REDACTED…/g' \
    -e 's/(npm_[A-Za-z0-9]{36})/npm_…REDACTED…/g' \
    -e 's/(sk_live_[A-Za-z0-9]{10,})/sk_live_…REDACTED…/g' \
    -e 's/(sk_test_[A-Za-z0-9]{10,})/sk_test_…REDACTED…/g' \
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

if [[ -d "$HOME/.codex" ]]; then
  rsync_safe "$HOME/.codex/" "$OUT/codex/home-dot-codex/" \
    --exclude '*auth*' --exclude '*credential*' --exclude '*token*' --exclude '*.key'
fi
if [[ -d "$HOME/.config/codex" ]]; then
  rsync_safe "$HOME/.config/codex/" "$OUT/codex/config-codex/" \
    --exclude '*auth*' --exclude '*credential*' --exclude '*token*' --exclude '*.key'
fi

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
$(find "$HOME" -maxdepth 3 -type d \( -iname '*daylight*' -o -iname '*dc1*' \) \
    ! -path '*/Library/*' ! -path '*/.Trash/*' ! -path '*/node_modules/*' \
    ! -path '*/.git/*' ! -path '*/dist/*' ! -path '*/target/*' ! -path '*/.venv/*' \
    ! -path '*/twinkit-pack-*/*' ! -path '*/twinkit-discover-*/*' \
    ! -path "$OUT" ! -path "$OUT/*" \
    2>/dev/null | head -20 || true)
EOF

for d in ${DAYLIGHT_CANDIDATES[@]+"${DAYLIGHT_CANDIDATES[@]}"}; do
  if [[ -d "$d" ]]; then
    case "$d" in
      "$OUT"|"$OUT"/*|*/twinkit-pack-*|*/twinkit-pack-*) continue ;;
    esac
    [[ "$d" == "$OUT"* ]] && continue
    name=$(printf '%s' "$d" | sed "s|^$HOME/||; s|/|_|g")
    [[ -n "$name" ]] || name=$(basename "$d")
    rsync_safe "$d/" "$OUT/daylight/$name/" \
      --exclude node_modules --exclude .git --exclude build --exclude .gradle \
      --exclude dist --exclude target --exclude .venv \
      --exclude '*.keystore' --exclude '*.pem' --exclude '*secret*' \
      --exclude '.env' --exclude '.env.*'
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

if [[ -f "${TWINKIT_PROGRESS:-}" ]]; then
  cp "$TWINKIT_PROGRESS" "$OUT/progress.json"
else
  MODULES_JSON='["core","claude","codex","chrome","permissions","ssh","transfer"]'
  if [[ -f "$OUT/INVENTORY.json" ]]; then
    MODULES_JSON=$(OUT="$OUT" python3 - <<'PY'
import json, os
from pathlib import Path
p = Path(os.environ.get("OUT", "")) / "INVENTORY.json"
mods = ["core"]
try:
    inv = json.loads(p.read_text())
    flags = inv.get("flags") or {}
    tools = inv.get("tools") or {}
    if flags.get("claudeDir") or (tools.get("claude") or {}).get("present"):
        mods.append("claude")
    if flags.get("codexDir") or (tools.get("codex") or {}).get("present"):
        mods.append("codex")
    if (tools.get("grok") or {}).get("present"):
        mods.append("grok")
    if (tools.get("muse") or {}).get("present"):
        mods.append("muse")
    if flags.get("androidHome") or flags.get("gradleHome"):
        mods.append("android")
    if flags.get("daylightHits"):
        mods.append("daylight")
    mods += ["chrome", "permissions", "ssh", "transfer"]
except Exception:
    mods = ["core", "claude", "codex", "chrome", "permissions", "ssh", "transfer"]
# unique, stable
out = []
for m in mods:
    if m not in out:
        out.append(m)
print(json.dumps(out))
PY
)
  fi
  OUT="$OUT" MODULES_JSON="$MODULES_JSON" python3 - <<'PY'
import json, os, time
from pathlib import Path
out = Path(os.environ["OUT"])
mods = json.loads(os.environ["MODULES_JSON"])
data = {
  "version": 4,
  "twinkit": "0.6.0",
  "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
  "mode": "unpack",
  "enabledModules": mods,
  "checked": {},
  "skipped": {},
  "acceptedGaps": {},
  "checkedAt": {},
  "startedAt": None,
  "completedAt": None,
  "celebratedSections": [],
  "packLabel": out.name,
  "paused": False,
}
(out / "progress.json").write_text(json.dumps(data, indent=2) + "\n")
PY
fi

REPORT="$OUT/SECRETS_REPORT.md"
OUT="$OUT" python3 - <<'PY'
import os, re, sys
from pathlib import Path

root = Path(os.environ["OUT"])
patterns = [
    ("openai-sk", re.compile(r"sk-[A-Za-z0-9_-]{12,}")),
    ("stripe-live", re.compile(r"sk_live_[A-Za-z0-9]{10,}")),
    ("stripe-test", re.compile(r"sk_test_[A-Za-z0-9]{10,}")),
    ("ghp", re.compile(r"ghp_[A-Za-z0-9]{20,}")),
    ("gho", re.compile(r"gho_[A-Za-z0-9]{20,}")),
    ("ghu", re.compile(r"ghu_[A-Za-z0-9]{20,}")),
    ("github_pat", re.compile(r"github_pat_[A-Za-z0-9_]{20,}")),
    ("akia", re.compile(r"AKIA[0-9A-Z]{12,}")),
    ("slack", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("xai", re.compile(r"xai-[A-Za-z0-9_-]{10,}")),
    ("google-ai", re.compile(r"AIza[0-9A-Za-z_-]{20,}")),
    ("npm", re.compile(r"npm_[A-Za-z0-9]{36}")),
    ("pem", re.compile(r"-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----")),
    ("bearer", re.compile(r"Bearer [A-Za-z0-9._\-]{20,}")),
]
skip_names = {"SECRETS_REPORT.md", "hits.txt", "THREAT_MODEL.md"}
hits = []
try:
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d != "scan"]
        for fn in files:
            if fn in skip_names:
                continue
            p = Path(dirpath) / fn
            try:
                text = p.read_text(errors="replace")
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                for name, rx in patterns:
                    if rx.search(line):
                        rel = p.relative_to(root).as_posix()
                        hits.append(f"{rel}:{i}:{name}")
except Exception as e:
    print(f"SCAN-FAILED:{e}", file=sys.stderr)
    sys.exit(2)

hits_path = root / "scan" / "hits.txt"
hits_path.write_text("\n".join(hits) + ("\n" if hits else ""))
report = root / "SECRETS_REPORT.md"
lines = [
    "# SECRETS_REPORT",
    f"Scanned: {__import__('time').strftime('%Y-%m-%dT%H:%M:%S')}",
    "",
    "Hits are path:line:pattern-id only. Matching text is never stored.",
    "",
    "## Matches",
]
if hits:
    lines.append(f"Found {len(hits)} hit(s):")
    lines.extend(hits[:200])
else:
    lines.append("No pattern hits (best-effort, not a guarantee).")
report.write_text("\n".join(lines) + "\n")
print(len(hits))
PY
SCAN_RC=$?
FINDINGS=0
if [[ "$SCAN_RC" -ne 0 ]]; then
  echo "!! secret scan could not run. Refusing to leave a pack." >&2
  rm -rf "$OUT"
  exit 2
fi
if [[ -s "$OUT/scan/hits.txt" ]]; then
  FINDINGS=$(wc -l < "$OUT/scan/hits.txt" | tr -d ' ')
fi

cat > "$OUT/THREAT_MODEL.md" << 'TM'
# Threat model
This pack is sensitive configuration, not a souvenir.
TwinKit redacts shell rc, skips known credential filenames, and scans for
common secret patterns. That is best-effort — not a guarantee.
Keep the folder on a FileVault volume. Delete it after transfer.
TM

if [[ "$FINDINGS" != "0" && "${TWINKIT_ALLOW_SECRETS:-0}" != "1" ]]; then
  UNSAFE="${OUT}-UNSAFE-DO-NOT-TRANSFER"
  rm -rf "$UNSAFE"
  mv "$OUT" "$UNSAFE"
  echo "!! SECRET SCAN: $FINDINGS hit(s). Pack moved to:"
  echo "   $UNSAFE"
  echo "   Report lists path:line:pattern only. Set TWINKIT_ALLOW_SECRETS=1 to keep a pack in place."
  exit 2
fi
echo "==> Done → $OUT"
