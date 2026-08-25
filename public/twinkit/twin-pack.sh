#!/usr/bin/env bash
# TwinKit pack 0.6.0
# no cp -R fallback — rsync required
# Build in a private staging dir. A transferable $OUT exists only after a clean scan.
set -euo pipefail

if ! command -v rsync >/dev/null 2>&1; then
  echo "!! rsync required (no cp -R fallback). brew install rsync" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "!! python3 required for the secret scan." >&2
  exit 1
fi

RESET=0
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    -h|--help)
      echo "Usage: bash twin-pack.sh [--reset]" >&2
      exit 0
      ;;
    --*) echo "Unknown option: $arg" >&2; exit 1 ;;
    *) echo "Usage: bash twin-pack.sh [--reset]" >&2; exit 1 ;;
  esac
done

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="${TWINKIT_OUT:-$HOME/Desktop/twinkit-pack-$STAMP}"
UNSAFE="${OUT}-UNSAFE-DO-NOT-TRANSFER"
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/twinkit-stage.XXXXXX")
SCAN_PASSED=0

cleanup() {
  if [[ "${SCAN_PASSED:-0}" -eq 1 ]]; then
    return 0
  fi
  if [[ -n "${STAGE:-}" && -d "$STAGE" ]]; then
    rm -rf "$UNSAFE"
    mv "$STAGE" "$UNSAFE" 2>/dev/null || rm -rf "$STAGE"
  fi
  # Never leave a plain-named destination that looks transferable.
  if [[ -d "$OUT" ]]; then
    rm -rf "$OUT"
  fi
}
trap cleanup EXIT

mkdir -p "$STAGE"/{dotfiles,claude,codex,gradle,android,daylight,notes,brew,bin-meta,scan}

echo "==> TwinKit pack 0.6.0 → $OUT (staging)"

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
} > "$STAGE/MANIFEST.md"

if [[ -f "${TWINKIT_INVENTORY:-}" ]]; then
  cp "$TWINKIT_INVENTORY" "$STAGE/INVENTORY.json" || true
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
      cp "$HOME/$f" "$STAGE/dotfiles/$f"
    else
      redact_rc "$HOME/$f" "$STAGE/dotfiles/$f"
      echo "Redacted $f" >> "$STAGE/notes/rc-policy.txt"
    fi
  fi
done

command -v git >/dev/null 2>&1 && git config --global --list > "$STAGE/dotfiles/git-global.ini" 2>/dev/null || true

if command -v brew >/dev/null 2>&1; then
  brew bundle dump --file="$STAGE/brew/Brewfile" --force 2>/dev/null || true
  brew list --formula > "$STAGE/brew/formulae.txt" 2>/dev/null || true
  brew list --cask > "$STAGE/brew/casks.txt" 2>/dev/null || true
fi

if [[ -d "$HOME/.claude" ]]; then
  rsync_safe "$HOME/.claude/" "$STAGE/claude/" \
    --exclude 'cache' --exclude 'caches' --exclude '*.key' \
    --exclude 'statsig' --exclude 'telemetry' \
    --exclude '*credentials*' --exclude '*token*' \
    --exclude '.credentials.json' --exclude 'session*'
fi
command -v mdfind >/dev/null 2>&1 && mdfind -name 'CLAUDE.md' 2>/dev/null | head -80 > "$STAGE/notes/claude-md-paths.txt" || true

if [[ -d "$HOME/.codex" ]]; then
  rsync_safe "$HOME/.codex/" "$STAGE/codex/home-dot-codex/" \
    --exclude '*auth*' --exclude '*credential*' --exclude '*token*' --exclude '*.key'
fi
if [[ -d "$HOME/.config/codex" ]]; then
  rsync_safe "$HOME/.config/codex/" "$STAGE/codex/config-codex/" \
    --exclude '*auth*' --exclude '*credential*' --exclude '*token*' --exclude '*.key'
fi

if [[ -d "$HOME/.gradle" ]]; then
  mkdir -p "$STAGE/gradle"
  [[ -f "$HOME/.gradle/gradle.properties" ]] && redact_rc "$HOME/.gradle/gradle.properties" "$STAGE/gradle/gradle.properties"
  [[ -d "$HOME/.gradle/init.d" ]] && rsync_safe "$HOME/.gradle/init.d/" "$STAGE/gradle/init.d/"
fi

{
  echo "ANDROID_HOME=${ANDROID_HOME:-}"
  echo "ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-}"
  echo "JAVA_HOME=${JAVA_HOME:-}"
} > "$STAGE/android/env-and-packages.txt" || true

DAYLIGHT_CANDIDATES=("$HOME/daylight" "$HOME/dc1" "$HOME/src/daylight" "$HOME/Developer/daylight")
while IFS= read -r d; do
  [[ -n "$d" ]] && DAYLIGHT_CANDIDATES+=("$d")
done <<EOF
$(find "$HOME" -maxdepth 3 -type d \( -iname '*daylight*' -o -iname '*dc1*' \) \
    ! -path '*/Library/*' ! -path '*/.Trash/*' ! -path '*/node_modules/*' \
    ! -path '*/.git/*' ! -path '*/dist/*' ! -path '*/target/*' ! -path '*/.venv/*' \
    ! -path '*/twinkit-pack-*/*' ! -path '*/twinkit-discover-*/*' \
    ! -path "$OUT" ! -path "$OUT/*" ! -path "$STAGE" ! -path "$STAGE/*" \
    2>/dev/null | head -20 || true)
EOF

for d in ${DAYLIGHT_CANDIDATES[@]+"${DAYLIGHT_CANDIDATES[@]}"}; do
  if [[ -d "$d" ]]; then
    case "$d" in
      "$OUT"|"$OUT"/*|*/twinkit-pack-*|*/twinkit-pack-*) continue ;;
    esac
    [[ "$d" == "$OUT"* ]] && continue
    [[ "$d" == "$STAGE"* ]] && continue
    name=$(printf '%s' "$d" | sed "s|^$HOME/||; s|/|_|g")
    [[ -n "$name" ]] || name=$(basename "$d")
    rsync_safe "$d/" "$STAGE/daylight/$name/" \
      --exclude node_modules --exclude .git --exclude build --exclude .gradle \
      --exclude dist --exclude target --exclude .venv \
      --exclude '*.keystore' --exclude '*.pem' --exclude '*secret*' \
      --exclude '.env' --exclude '.env.*'
  fi
done

if [[ -d "$HOME/.ssh" ]]; then
  mkdir -p "$STAGE/dotfiles/ssh-public"
  cp "$HOME/.ssh"/*.pub "$STAGE/dotfiles/ssh-public/" 2>/dev/null || true
fi

cat > "$STAGE/notes/HUMAN.md" << 'NOTE'
# Human notes
## Auth methods
## MCP secrets (names only)
## DC1 smoke
NOTE

# progress.json: keep an existing pack's file unless --reset
if [[ "$RESET" -eq 0 && -f "$OUT/progress.json" ]]; then
  cp -a "$OUT/progress.json" "$STAGE/progress.json"
elif [[ -f "${TWINKIT_PROGRESS:-}" ]]; then
  cp "$TWINKIT_PROGRESS" "$STAGE/progress.json"
else
  MODULES_JSON='["core","claude","codex","chrome","permissions","ssh","transfer"]'
  TWINKIT_PACK_LABEL=$(basename "$OUT")
  export TWINKIT_PACK_LABEL
  if [[ -f "$STAGE/INVENTORY.json" ]]; then
    MODULES_JSON=$(OUT="$STAGE" python3 - <<'PY'
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
out = []
for m in mods:
    if m not in out:
        out.append(m)
print(json.dumps(out))
PY
)
  fi
  OUT="$STAGE" MODULES_JSON="$MODULES_JSON" python3 - <<'PY'
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
  "packLabel": os.environ.get("TWINKIT_PACK_LABEL") or out.name,
  "paused": False,
}
(out / "progress.json").write_text(json.dumps(data, indent=2) + "\n")
PY
fi

cat > "$STAGE/THREAT_MODEL.md" << 'TM'
# Threat model
This pack is sensitive configuration, not a souvenir.
TwinKit redacts shell rc, skips known credential filenames, and scans for
common secret patterns. That is best-effort — not a guarantee.
Keep the folder on a FileVault volume. Delete it after transfer.
TM

set +e
FINDINGS_RAW=$(OUT="$STAGE" python3 - <<'PY'
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
            if not p.is_file():
                continue
            try:
                mode = p.stat().st_mode
                if (mode & 0o444) == 0:
                    print(f"SCAN-FAILED:unreadable:{p}:no-read-bits", file=sys.stderr)
                    sys.exit(2)
                text = p.read_text(errors="replace")
            except Exception as e:
                print(f"SCAN-FAILED:unreadable:{p}:{e}", file=sys.stderr)
                sys.exit(2)
            for i, line in enumerate(text.splitlines(), 1):
                for name, rx in patterns:
                    if rx.search(line):
                        rel = p.relative_to(root).as_posix()
                        hits.append(f"{rel}:{i}:{name}")
except Exception as e:
    print(f"SCAN-FAILED:{e}", file=sys.stderr)
    sys.exit(2)

scan_dir = root / "scan"
try:
    scan_dir.mkdir(parents=True, exist_ok=True)
    hits_path = scan_dir / "hits.txt"
    if hits_path.exists() and hits_path.is_dir():
        print("SCAN-FAILED:hits.txt is a directory", file=sys.stderr)
        sys.exit(2)
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
except Exception as e:
    print(f"SCAN-FAILED:write:{e}", file=sys.stderr)
    sys.exit(2)
print(len(hits))
PY
)
SCAN_RC=$?
set -e

if [[ "$SCAN_RC" -ne 0 ]]; then
  echo "!! secret scan could not run. Refusing to leave a pack." >&2
  exit 2
fi

FINDINGS=0
if [[ -s "$STAGE/scan/hits.txt" ]]; then
  FINDINGS=$(wc -l < "$STAGE/scan/hits.txt" | tr -d ' ')
fi

if [[ "$FINDINGS" != "0" && "${TWINKIT_ALLOW_SECRETS:-0}" != "1" ]]; then
  echo "!! SECRET SCAN: $FINDINGS hit(s)."
  echo "   Report lists path:line:pattern only. Set TWINKIT_ALLOW_SECRETS=1 to keep a pack in place."
  exit 2
fi

# Hostile / occupied destination: do not publish over a poisoned $OUT.
if [[ -d "$OUT/scan/hits.txt" ]]; then
  echo "!! $OUT/scan/hits.txt is a directory; refusing to publish." >&2
  exit 2
fi

# Atomic publish: only now does a plain-named $OUT appear.
SCAN_PASSED=1
trap - EXIT
if [[ -d "$OUT" ]]; then
  rm -rf "$OUT"
fi
mv "$STAGE" "$OUT"
echo "==> Done → $OUT"
