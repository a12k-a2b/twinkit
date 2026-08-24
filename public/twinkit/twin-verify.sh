#!/usr/bin/env bash
# TwinKit verify 0.5.0
set -euo pipefail
PACK="${1:-}"
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
  for r in "${results[@]}"; do IFS='|' read -r st name detail <<< "$r"; echo "| $st | \`$name\` | $detail |"; done
  echo; echo "## Summary"; echo "- pass: $pass"; echo "- warn: $warn"; echo "- fail: $fail"
} > "$OUT"
{
  echo "{"
  echo "  \"twinkit\": \"0.5.0\","
  echo "  \"generatedAt\": \"$(date -Iseconds 2>/dev/null || date)\","
  echo "  \"pass\": $pass,"
  echo "  \"warn\": $warn,"
  echo "  \"fail\": $fail,"
  echo "  \"ok\": $([ "$fail" -eq 0 ] && echo true || echo false),"
  echo "  \"results\": ["
  i=0
  for r in "${results[@]}"; do
    IFS='|' read -r st name detail <<< "$r"
    detail_esc=$(printf '%s' "$detail" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "\"\"")
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
