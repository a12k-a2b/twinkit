import type {
  ChecklistItem,
  LaneId,
  ScriptKey,
} from "./types";

/** Lane lockrails: optional Android/DC1 cannot block agent twin. */
export function laneForItem(item: ChecklistItem): LaneId {
  if (item.modules.includes("android") || item.modules.includes("daylight")) {
    return "later";
  }
  if (item.modules.includes("grok") || item.modules.includes("muse")) {
    return "polish";
  }
  if (
    item.id.startsWith("unpack-final") ||
    item.id === "unpack-yeet" ||
    item.id === "unpack-backup-note" ||
    item.id === "unpack-leave-plugged" ||
    item.id === "unpack-accept-gaps"
  ) {
    return "polish";
  }
  return "must";
}

export const LANE_LABEL: Record<LaneId, string> = {
  must: "Must — agents work",
  later: "Later — Android / DC1",
  polish: "Polish — sidekicks & extras",
};

export const LANE_SHORT: Record<LaneId, string> = {
  must: "Must",
  later: "Later",
  polish: "Polish",
};

export function scriptKeyFor(item: ChecklistItem): ScriptKey | null {
  const id = item.id;
  if (id.includes("discover")) return "discover";
  if (id.includes("download-script") || id === "pack-run-script") return "pack";
  if (
    id.includes("unpack-run-script") ||
    id.includes("unpack-dry-run") ||
    id === "unpack-bring-pack"
  ) {
    return "unpack";
  }
  if (id.includes("verify")) return "verify";
  if (id.includes("skill")) return "skill";
  if (item.kind === "download" && id.includes("pack")) return "pack";
  return null;
}

export const SETTINGS_URL: Record<string, string> = {
  "unpack-name-mac":
    "x-apple.systempreferences:com.apple.preferences.sharing",
  "unpack-perm-accessibility":
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  "unpack-perm-screen":
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  "unpack-perm-fda":
    "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
  "unpack-perm-automation":
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
  "unpack-perm-input":
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
  "unpack-daylight-trust":
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  "unpack-perm-relaunch":
    "x-apple.systempreferences:com.apple.preference.security",
};

export const AUTH_URL: Record<string, string> = {
  "unpack-claude-auth": "https://claude.ai/login",
  "pack-claude-auth-note": "https://claude.ai/login",
  "unpack-codex-auth": "https://chatgpt.com/",
  "unpack-github-auth": "https://github.com/login",
  "unpack-ext-claude": "https://claude.ai/download",
  "unpack-ext-codex": "https://chatgpt.com/",
  "unpack-ext-password": "https://passwords.google.com/",
};

export function settingsUrlFor(item: ChecklistItem): string | null {
  if (SETTINGS_URL[item.id]) return SETTINGS_URL[item.id]!;
  const m = item.command?.match(/x-apple\.systempreferences:[^'\s]+/);
  return m ? m[0] : null;
}

export function authUrlFor(item: ChecklistItem): string | null {
  return AUTH_URL[item.id] ?? null;
}

export const STUCK_HINTS: Record<string, string> = {
  default:
    "If this has gone sideways: skip it, or mark Doesn’t apply. You can undo later. Abandonment is allowed.",
  permission:
    "System Settings often needs: toggle ON → quit the app → reopen. Then come back and hit Done.",
  auth: "Log in in the other window. When the CLI or site says you’re in, hit Done. Don’t wait for perfect.",
  script:
    "If the script errors, copy the last 20 lines, skip this step, and keep moving. Pack exit 2 means read SECRETS_REPORT — that’s success, not failure.",
};

export function stuckHintFor(item: ChecklistItem): string {
  if (item.kind === "permission") return STUCK_HINTS.permission!;
  if (item.kind === "auth") return STUCK_HINTS.auth!;
  if (item.kind === "script" || item.kind === "download") return STUCK_HINTS.script!;
  return STUCK_HINTS.default!;
}

export const SCRIPT_FILES: Record<ScriptKey, string> = {
  discover: "twin-discover.sh",
  pack: "twin-pack.sh",
  unpack: "twin-unpack.sh",
  verify: "twin-verify.sh",
  skill: "SKILL.md",
};
