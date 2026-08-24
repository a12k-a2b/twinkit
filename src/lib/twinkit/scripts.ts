/** Downloadable shell scripts + skill text (single source; also synced to public/twinkit). */

export const TWINKIT_SH_VERSION = "0.5.0";

export const TWIN_DISCOVER_SH = `#!/usr/bin/env bash
# TwinKit discover ${TWINKIT_SH_VERSION} — inventory THIS Mac (no secrets dumped).
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M)
OUT="\${TWINKIT_DISCOVER_OUT:-$HOME/Desktop/twinkit-discover-$STAMP}"
mkdir -p "$OUT"

echo "==> TwinKit discover → $OUT"

json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"
}

tool_json() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    local path ver
    path=$(command -v "$name")
    ver=$("$name" --version 2>/dev/null | head -1 || "$name" -v 2>/dev/null | head -1 || echo present)
    ver=\${ver//$'\\n'/ }
    printf '{"present":true,"path":%s,"version":%s}' "$(json_escape "$path")" "$(json_escape "$ver")"
  else
    printf '{"present":false}'
  fi
}

DAYLIGHT_HITS=()
while IFS= read -r d; do
  [[ -n "$d" ]] && DAYLIGHT_HITS+=("$d")
done <<EOF
$(find "$HOME" -maxdepth 3 -type d \\( -iname '*daylight*' -o -iname '*dc1*' \\) 2>/dev/null | head -40 || true)
EOF

CLAUDE_DIR=0; [[ -d "$HOME/.claude" ]] && CLAUDE_DIR=1
CODEX_DIR=0; [[ -d "$HOME/.codex" || -d "$HOME/.config/codex" ]] && CODEX_DIR=1
GRADLE_HOME=0; [[ -d "$HOME/.gradle" ]] && GRADLE_HOME=1
ANDROID_HOME_SET=0; [[ -n "\${ANDROID_HOME:-}\${ANDROID_SDK_ROOT:-}" ]] && ANDROID_HOME_SET=1
SSH_PUB=0; ls "$HOME/.ssh"/*.pub >/dev/null 2>&1 && SSH_PUB=1
DAYLIGHT_FLAG=0; [[ \${#DAYLIGHT_HITS[@]} -gt 0 ]] && DAYLIGHT_FLAG=1

{
  echo "{"
  echo "  \\"twinkit\\": \\"${TWINKIT_SH_VERSION}\\","
  echo "  \\"generatedAt\\": \\"$(date -Iseconds 2>/dev/null || date)\\","
  echo "  \\"host\\": $(json_escape "$(scutil --get ComputerName 2>/dev/null || hostname)"),"
  echo "  \\"arch\\": $(json_escape "$(uname -m)"),"
  echo "  \\"macos\\": $(json_escape "$(sw_vers -productVersion 2>/dev/null || echo unknown)"),"
  echo "  \\"tools\\": {"
  first=1
  for c in brew git node npm npx java adb claude codex grok muse gh python3 emulator sdkmanager; do
    [[ $first -eq 1 ]] || echo ","
    first=0
    printf '    "%s": %s' "$c" "$(tool_json "$c")"
  done
  echo ""
  echo "  },"
  echo "  \\"flags\\": {"
  echo "    \\"claudeDir\\": $([ "$CLAUDE_DIR" -eq 1 ] && echo true || echo false),"
  echo "    \\"codexDir\\": $([ "$CODEX_DIR" -eq 1 ] && echo true || echo false),"
  echo "    \\"gradleHome\\": $([ "$GRADLE_HOME" -eq 1 ] && echo true || echo false),"
  echo "    \\"androidHome\\": $([ "$ANDROID_HOME_SET" -eq 1 ] && echo true || echo false),"
  echo "    \\"sshPubKeys\\": $([ "$SSH_PUB" -eq 1 ] && echo true || echo false),"
  echo "    \\"daylightHits\\": $([ "$DAYLIGHT_FLAG" -eq 1 ] && echo true || echo false)"
  echo "  },"
  echo "  \\"envNames\\": ["
  env | grep -E '^(ANDROID_|JAVA_|GRADLE_|CLAUDE_|OPENAI_|GROK_|MUSE_)' | sed 's/=.*//' | sort -u | awk 'BEGIN{f=0} {if(f) printf ",\\n"; printf "    \\"%s\\"", $0; f=1} END{print ""}'
  echo "  ],"
  echo "  \\"dirs\\": {"
  echo "    \\"daylight\\": ["
  di=0
  for d in "\${DAYLIGHT_HITS[@]}"; do
    [[ $di -eq 0 ]] || echo ","
    printf '      %s' "$(json_escape "$d")"
    di=1
  done
  echo ""
  echo "    ]"
  echo "  },"
  echo "  \\"claude\\": {"
  if [[ -d "$HOME/.claude" ]]; then
    echo "    \\"skills\\": ["
    if [[ -d "$HOME/.claude/skills" ]]; then
      ls -1 "$HOME/.claude/skills" 2>/dev/null | awk 'BEGIN{f=0} {if(f) printf ",\\n"; printf "      \\"%s\\"", $0; f=1} END{print ""}'
    fi
    echo "    ]"
  else
    echo "    \\"skills\\": []"
  fi
  echo "  }"
  echo "}"
} > "$OUT/INVENTORY.json"

{
  echo "# TwinKit inventory"
  echo "Generated: $(date)"
  host_name=$(scutil --get ComputerName 2>/dev/null || hostname)
  arch=$(uname -m)
  echo "Host: $host_name ($arch)"
  echo
  echo "## Tools"
  for c in brew git node npm java adb claude codex grok muse gh; do
    if command -v "$c" >/dev/null 2>&1; then
      echo "- $c: $(command -v "$c") — $($c --version 2>/dev/null | head -1 || echo present)"
    else
      echo "- $c: missing"
    fi
  done
  echo
  echo "Import INVENTORY.json in TwinKit (Load inventory)."
} > "$OUT/INVENTORY.md"

echo "==> Wrote $OUT/INVENTORY.json"
`;

export const TWIN_PACK_SH = `#!/usr/bin/env bash
# TwinKit pack ${TWINKIT_SH_VERSION}
# no cp -R fallback — rsync required
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M)
OUT="\${TWINKIT_OUT:-$HOME/Desktop/twinkit-pack-$STAMP}"
mkdir -p "$OUT"/{dotfiles,claude,codex,gradle,android,daylight,notes,brew,bin-meta,scan}

echo "==> TwinKit pack ${TWINKIT_SH_VERSION} → $OUT"

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
  echo "TwinKit: ${TWINKIT_SH_VERSION}"
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

if [[ -f "\${TWINKIT_INVENTORY:-}" ]]; then
  cp "\$TWINKIT_INVENTORY" "$OUT/INVENTORY.json" || true
fi

redact_rc() {
  local src="$1" dest="$2"
  sed -E \\
    -e 's/(api[_-]?key|token|secret|password|passwd|auth)[[:space:]]*=[[:space:]]*[^[:space:]]+/\\1=…/Ig' \\
    -e 's/(sk-[A-Za-z0-9_-]{10,})/sk-…REDACTED…/g' \\
    -e 's/(ghp_[A-Za-z0-9]{20,})/ghp_…REDACTED…/g' \\
    -e 's/(github_pat_[A-Za-z0-9_]{20,})/github_pat_…REDACTED…/g' \\
    -e 's/(AKIA[0-9A-Z]{12,})/AKIA…REDACTED…/g' \\
    -e 's/(xox[baprs]-[A-Za-z0-9-]{10,})/xox…REDACTED…/g' \\
    -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._\\-]{10,}/\\1…REDACTED…/g' \\
    "$src" > "$dest"
}

for f in .zshrc .zprofile .zshenv .bashrc .bash_profile .profile .zalias; do
  if [[ -f "$HOME/$f" ]]; then
    if [[ "\${TWINKIT_PACK_RAW_RC:-0}" == "1" ]]; then
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
  rsync_safe "$HOME/.claude/" "$OUT/claude/" \\
    --exclude 'cache' --exclude 'caches' --exclude '*.key' \\
    --exclude 'statsig' --exclude 'telemetry' \\
    --exclude '*credentials*' --exclude '*secret*' --exclude '*token*' \\
    --exclude '.credentials.json' --exclude 'session*'
fi
command -v mdfind >/dev/null 2>&1 && mdfind -name 'CLAUDE.md' 2>/dev/null | head -80 > "$OUT/notes/claude-md-paths.txt" || true

for d in "$HOME/.codex" "$HOME/.config/codex"; do
  if [[ -d "$d" ]]; then
    base=$(basename "$d")
    rsync_safe "$d/" "$OUT/codex/$base/" \\
      --exclude '*auth*' --exclude '*credential*' --exclude '*token*' --exclude '*.key'
  fi
done

if [[ -d "$HOME/.gradle" ]]; then
  mkdir -p "$OUT/gradle"
  [[ -f "$HOME/.gradle/gradle.properties" ]] && redact_rc "$HOME/.gradle/gradle.properties" "$OUT/gradle/gradle.properties"
  [[ -d "$HOME/.gradle/init.d" ]] && rsync_safe "$HOME/.gradle/init.d/" "$OUT/gradle/init.d/"
fi

{
  echo "ANDROID_HOME=\${ANDROID_HOME:-}"
  echo "ANDROID_SDK_ROOT=\${ANDROID_SDK_ROOT:-}"
  echo "JAVA_HOME=\${JAVA_HOME:-}"
} > "$OUT/android/env-and-packages.txt" || true

DAYLIGHT_CANDIDATES=("$HOME/daylight" "$HOME/dc1" "$HOME/src/daylight" "$HOME/Developer/daylight")
while IFS= read -r d; do
  [[ -n "$d" ]] && DAYLIGHT_CANDIDATES+=("$d")
done <<EOF
$(find "$HOME" -maxdepth 3 -type d \\( -iname '*daylight*' -o -iname '*dc1*' \\) 2>/dev/null | head -20 || true)
EOF
for d in "\${DAYLIGHT_CANDIDATES[@]}"; do
  if [[ -d "$d" ]]; then
    name=$(basename "$d")
    rsync_safe "$d/" "$OUT/daylight/$name/" \\
      --exclude node_modules --exclude .git --exclude build --exclude .gradle \\
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
  "twinkit": "${TWINKIT_SH_VERSION}",
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
for pat in 'sk-[A-Za-z0-9_-]{12,}' 'ghp_[A-Za-z0-9]{20,}' 'github_pat_[A-Za-z0-9_]{20,}' 'AKIA[0-9A-Z]{12,}' 'xox[baprs]-[A-Za-z0-9-]{10,}' '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----' 'Bearer [A-Za-z0-9._\\-]{20,}'; do
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

if [[ "$FINDINGS" != "0" && "\${TWINKIT_ALLOW_SECRETS:-0}" != "1" ]]; then
  echo "!! SECRET SCAN: $FINDINGS hit(s). See $REPORT"
  exit 2
fi
echo "==> Done → $OUT"
`;

export const TWIN_UNPACK_SH = `#!/usr/bin/env bash
# TwinKit unpack ${TWINKIT_SH_VERSION}
set -euo pipefail
DRY=0; PACK=""
for arg in "$@"; do case "$arg" in --dry-run) DRY=1 ;; *) PACK="$arg" ;; esac; done
[[ -n "$PACK" && -d "$PACK" ]] || { echo "Usage: bash twin-unpack.sh [--dry-run] PACK"; exit 1; }
PACK=$(cd "$PACK" && pwd)
echo "==> unpack ${TWINKIT_SH_VERSION} $PACK dry=$DRY"
run() { if [[ "$DRY" -eq 1 ]]; then echo "DRY: $*"; else eval "$@"; fi; }
backup() {
  local t="$1"
  if [[ -e "$t" && ! -e "\${t}.twinkit-backup" ]]; then
    [[ "$DRY" -eq 1 ]] && echo "DRY: backup $t" || cp -a "$t" "\${t}.twinkit-backup"
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
p.write_text(json.dumps(data,indent=2)+"\\n")
print("updated progress.json")
PY
fi
echo "Next: load progress.json in TwinKit; bash twin-verify.sh $PACK"
`;

export const TWIN_VERIFY_SH = `#!/usr/bin/env bash
# TwinKit verify ${TWINKIT_SH_VERSION}
set -euo pipefail
PACK="\${1:-}"
[[ -n "$PACK" && -d "$PACK" ]] || { echo "Usage: bash twin-verify.sh PACK"; exit 1; }
PACK=$(cd "$PACK" && pwd)
OUT="$PACK/PARITY.md"; JSON="$PACK/PARITY.json"
pass=0; warn=0; fail=0
results=()
check_tool() {
  local name="$1" want
  want=$(grep -E "^- $name:" "$PACK/MANIFEST.md" 2>/dev/null | head -1 || true)
  if [[ -z "$want" || "$want" == *"(not found)"* ]]; then
    if command -v "$name" >/dev/null 2>&1; then results+=("warn|$name|extra"); warn=$((warn+1)); else results+=("skip|$name|absent"); fi
    return
  fi
  if command -v "$name" >/dev/null 2>&1; then
    results+=("pass|$name|$($name --version 2>/dev/null | head -1 || echo present)")
    pass=$((pass+1))
  else
    results+=("fail|$name|MISSING")
    fail=$((fail+1))
  fi
}
for c in brew git node npm java adb claude codex grok muse gh; do check_tool "$c"; done
if [[ -d "$HOME/.claude" ]]; then results+=("pass|dir-claude|present"); pass=$((pass+1)); else results+=("fail|dir-claude|missing"); fail=$((fail+1)); fi
{
  echo "# TwinKit PARITY REPORT"; echo "Generated: $(date)"; echo "Pack: $PACK"; echo
  echo "| Status | Check | Detail |"; echo "|--------|-------|--------|"
  for r in "\${results[@]}"; do IFS='|' read -r st name detail <<< "$r"; echo "| $st | \\\`$name\\\` | $detail |"; done
  echo; echo "## Summary"; echo "- pass: $pass"; echo "- warn: $warn"; echo "- fail: $fail"
} > "$OUT"
{
  echo "{"
  echo "  \\"twinkit\\": \\"${TWINKIT_SH_VERSION}\\","
  echo "  \\"generatedAt\\": \\"$(date -Iseconds 2>/dev/null || date)\\","
  echo "  \\"pass\\": $pass,"
  echo "  \\"warn\\": $warn,"
  echo "  \\"fail\\": $fail,"
  echo "  \\"ok\\": $([ "$fail" -eq 0 ] && echo true || echo false),"
  echo "  \\"results\\": ["
  i=0
  for r in "\${results[@]}"; do
    IFS='|' read -r st name detail <<< "$r"
    detail_esc=$(printf '%s' "$detail" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\\"\\"")
    [[ $i -eq 0 ]] || echo ","
    printf '    {"status":"%s","name":"%s","detail":%s}' "$st" "$name" "$detail_esc"
    i=1
  done
  echo ""
  echo "  ]"
  echo "}"
} > "$JSON"
echo "==> $OUT pass=$pass warn=$warn fail=$fail"
[[ "$fail" -eq 0 ]]
`;

export const TWINKIT_SKILL_MD = `---
name: twinkit-migrate
description: >
  Migrate Claude Code / Codex Mac setups with TwinKit.
  Simple path: old Mac pack → new Mac unpack → verify → re-login.
metadata:
  short-description: "TwinKit ${TWINKIT_SH_VERSION} Mac setup twin"
---

# TwinKit ${TWINKIT_SH_VERSION}

Keep it simple:

1. On the **old Mac**: discover → pack (read SECRETS_REPORT if exit 2)
2. Copy the pack folder (SSD / AirDrop)
3. On the **new Mac**: unpack → re-login → permissions → verify
4. Load progress.json in TwinKit if you switch machines mid-run
5. Skips need an explicit "OK to skip" before you're done

Scripts: twin-discover.sh, twin-pack.sh, twin-unpack.sh, twin-verify.sh
`;

export const TWINKIT_PROMPT_MD = `# TwinKit ${TWINKIT_SH_VERSION}

Help me twin my Claude/Codex Mac setup. Keep steps short.
Old Mac: discover + pack. New Mac: unpack + re-auth + verify.
Never invent secrets. Prefer redacted configs.
`;

export const RAYCAST_SCRIPT = `#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title TwinKit
# @raycast.mode silent
# @raycast.packageName TwinKit
open "\${TWINKIT_URL:-https://YOUR-TWINKIT-APP.example}"
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
