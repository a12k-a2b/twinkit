#!/usr/bin/env bash
# TwinKit discover 0.5.0 — inventory THIS Mac (no secrets dumped).
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M)
OUT="${TWINKIT_DISCOVER_OUT:-$HOME/Desktop/twinkit-discover-$STAMP}"
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
    ver=${ver//$'\n'/ }
    printf '{"present":true,"path":%s,"version":%s}' "$(json_escape "$path")" "$(json_escape "$ver")"
  else
    printf '{"present":false}'
  fi
}

DAYLIGHT_HITS=()
while IFS= read -r d; do
  [[ -n "$d" ]] && DAYLIGHT_HITS+=("$d")
done <<EOF
$(find "$HOME" -maxdepth 3 -type d \( -iname '*daylight*' -o -iname '*dc1*' \) 2>/dev/null | head -40 || true)
EOF

CLAUDE_DIR=0; [[ -d "$HOME/.claude" ]] && CLAUDE_DIR=1
CODEX_DIR=0; [[ -d "$HOME/.codex" || -d "$HOME/.config/codex" ]] && CODEX_DIR=1
GRADLE_HOME=0; [[ -d "$HOME/.gradle" ]] && GRADLE_HOME=1
ANDROID_HOME_SET=0; [[ -n "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]] && ANDROID_HOME_SET=1
SSH_PUB=0; ls "$HOME/.ssh"/*.pub >/dev/null 2>&1 && SSH_PUB=1
DAYLIGHT_FLAG=0; [[ ${#DAYLIGHT_HITS[@]} -gt 0 ]] && DAYLIGHT_FLAG=1

{
  echo "{"
  echo "  \"twinkit\": \"0.5.0\","
  echo "  \"generatedAt\": \"$(date -Iseconds 2>/dev/null || date)\","
  echo "  \"host\": $(json_escape "$(scutil --get ComputerName 2>/dev/null || hostname)"),"
  echo "  \"arch\": $(json_escape "$(uname -m)"),"
  echo "  \"macos\": $(json_escape "$(sw_vers -productVersion 2>/dev/null || echo unknown)"),"
  echo "  \"tools\": {"
  first=1
  for c in brew git node npm npx java adb claude codex grok muse gh python3 emulator sdkmanager; do
    [[ $first -eq 1 ]] || echo ","
    first=0
    printf '    "%s": %s' "$c" "$(tool_json "$c")"
  done
  echo ""
  echo "  },"
  echo "  \"flags\": {"
  echo "    \"claudeDir\": $([ "$CLAUDE_DIR" -eq 1 ] && echo true || echo false),"
  echo "    \"codexDir\": $([ "$CODEX_DIR" -eq 1 ] && echo true || echo false),"
  echo "    \"gradleHome\": $([ "$GRADLE_HOME" -eq 1 ] && echo true || echo false),"
  echo "    \"androidHome\": $([ "$ANDROID_HOME_SET" -eq 1 ] && echo true || echo false),"
  echo "    \"sshPubKeys\": $([ "$SSH_PUB" -eq 1 ] && echo true || echo false),"
  echo "    \"daylightHits\": $([ "$DAYLIGHT_FLAG" -eq 1 ] && echo true || echo false)"
  echo "  },"
  echo "  \"envNames\": ["
  env | grep -E '^(ANDROID_|JAVA_|GRADLE_|CLAUDE_|OPENAI_|GROK_|MUSE_)' | sed 's/=.*//' | sort -u | awk 'BEGIN{f=0} {if(f) printf ",\n"; printf "    \"%s\"", $0; f=1} END{print ""}'
  echo "  ],"
  echo "  \"dirs\": {"
  echo "    \"daylight\": ["
  di=0
  for d in "${DAYLIGHT_HITS[@]}"; do
    [[ $di -eq 0 ]] || echo ","
    printf '      %s' "$(json_escape "$d")"
    di=1
  done
  echo ""
  echo "    ]"
  echo "  },"
  echo "  \"claude\": {"
  if [[ -d "$HOME/.claude" ]]; then
    echo "    \"skills\": ["
    if [[ -d "$HOME/.claude/skills" ]]; then
      ls -1 "$HOME/.claude/skills" 2>/dev/null | awk 'BEGIN{f=0} {if(f) printf ",\n"; printf "      \"%s\"", $0; f=1} END{print ""}'
    fi
    echo "    ]"
  else
    echo "    \"skills\": []"
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
