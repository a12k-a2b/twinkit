import type { ProfilePreset } from "./types";

/** Primary simple choices — keep to three. */
export const SIMPLE_PRESETS: ProfilePreset[] = [
  {
    id: "claude-codex",
    label: "Claude + Codex",
    simpleLabel: "Agents",
    description: "Claude, Codex, browser logins, permissions, SSH. Most people start here.",
    modules: [
      "core",
      "claude",
      "codex",
      "chrome",
      "permissions",
      "ssh",
      "transfer",
    ],
  },
  {
    id: "claude-sidekicks",
    label: "Agents + sidekicks",
    simpleLabel: "Agents + CLIs",
    description: "Above, plus Grok and Muse wired in.",
    modules: [
      "core",
      "claude",
      "codex",
      "grok",
      "muse",
      "chrome",
      "permissions",
      "ssh",
      "transfer",
    ],
  },
  {
    id: "daylight-android",
    label: "Full lab (Android / Daylight)",
    simpleLabel: "Full lab",
    description: "Everything, including Android/Gradle and Daylight DC1 paths.",
    modules: [
      "core",
      "claude",
      "codex",
      "grok",
      "muse",
      "android",
      "daylight",
      "chrome",
      "permissions",
      "ssh",
      "transfer",
    ],
  },
];

/** Extra presets only in “more options”. */
export const EXTRA_PRESETS: ProfilePreset[] = [
  {
    id: "home-mini-headless",
    label: "Lean home Mini",
    description: "Always-on Mac: Claude, shell, permissions, SSH. Skip browser fluff.",
    modules: ["core", "claude", "permissions", "ssh", "transfer"],
    mode: "unpack",
  },
  {
    id: "pack-only-snapshot",
    label: "Pack everything (old Mac)",
    description: "Capture a full desk snapshot — no unpack steps.",
    modules: [
      "core",
      "claude",
      "codex",
      "grok",
      "muse",
      "android",
      "daylight",
      "chrome",
      "permissions",
      "ssh",
      "transfer",
    ],
    mode: "pack",
  },
];

export const PROFILE_PRESETS: ProfilePreset[] = [...SIMPLE_PRESETS, ...EXTRA_PRESETS];
