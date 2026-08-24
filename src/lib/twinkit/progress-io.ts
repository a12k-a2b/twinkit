import {
  PROGRESS_FILE_VERSION,
  TWINKIT_VERSION,
  type LaneId,
  type ModuleId,
  type ProgressFile,
  type ProgressState,
} from "./types";
import { MODULES } from "./modules";

const VALID_MODULES = new Set(MODULES.map((m) => m.id));
const LANES = new Set<LaneId>(["must", "later", "polish"]);

export function buildProgressFile(
  state: Pick<
    ProgressState,
    | "mode"
    | "enabledModules"
    | "checked"
    | "skipped"
    | "acceptedGaps"
    | "checkedAt"
    | "startedAt"
    | "completedAt"
    | "celebratedSections"
    | "packLabel"
    | "profileId"
    | "paused"
    | "pausedAt"
    | "lastActiveAt"
    | "lastDoneId"
    | "lastDoneTitle"
    | "activeLane"
    | "unlockedLanes"
  >,
): ProgressFile {
  return {
    version: PROGRESS_FILE_VERSION,
    twinkit: TWINKIT_VERSION,
    exportedAt: new Date().toISOString(),
    mode: state.mode,
    enabledModules: state.enabledModules,
    checked: state.checked,
    skipped: state.skipped,
    acceptedGaps: state.acceptedGaps,
    checkedAt: state.checkedAt,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    celebratedSections: state.celebratedSections,
    packLabel: state.packLabel,
    profileId: state.profileId,
    paused: state.paused,
    pausedAt: state.pausedAt,
    lastActiveAt: state.lastActiveAt,
    lastDoneId: state.lastDoneId,
    lastDoneTitle: state.lastDoneTitle,
    activeLane: state.activeLane,
    unlockedLanes: state.unlockedLanes,
  };
}

function asBoolMap(v: unknown): Record<string, boolean> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val) out[k] = true;
  }
  return out;
}

function asNumMap(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  }
  return out;
}

export function parseProgressFile(raw: unknown): ProgressFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Not a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== "number") throw new Error("Missing version");

  const mode = o.mode;
  if (mode !== "both" && mode !== "pack" && mode !== "unpack") {
    throw new Error("Invalid mode");
  }
  const modules = Array.isArray(o.enabledModules)
    ? (o.enabledModules as unknown[]).filter(
        (m): m is ModuleId => typeof m === "string" && VALID_MODULES.has(m as ModuleId),
      )
    : [];
  if (!modules.includes("core")) modules.unshift("core");

  const unlocked: LaneId[] = Array.isArray(o.unlockedLanes)
    ? (o.unlockedLanes as unknown[]).filter(
        (x): x is LaneId => typeof x === "string" && LANES.has(x as LaneId),
      )
    : ["must"];
  if (!unlocked.includes("must")) unlocked.unshift("must");

  const activeLane: LaneId =
    typeof o.activeLane === "string" && LANES.has(o.activeLane as LaneId)
      ? (o.activeLane as LaneId)
      : "must";

  return {
    version: o.version,
    twinkit: typeof o.twinkit === "string" ? o.twinkit : TWINKIT_VERSION,
    exportedAt: typeof o.exportedAt === "string" ? o.exportedAt : new Date().toISOString(),
    mode,
    enabledModules: modules.length ? modules : ["core"],
    checked: asBoolMap(o.checked),
    skipped: asBoolMap(o.skipped),
    acceptedGaps: asBoolMap(o.acceptedGaps),
    checkedAt: asNumMap(o.checkedAt),
    startedAt: typeof o.startedAt === "number" ? o.startedAt : null,
    completedAt: typeof o.completedAt === "number" ? o.completedAt : null,
    celebratedSections: Array.isArray(o.celebratedSections)
      ? (o.celebratedSections as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    packLabel: typeof o.packLabel === "string" ? o.packLabel : null,
    profileId: typeof o.profileId === "string" ? o.profileId : null,
    paused: o.paused === true,
    pausedAt: typeof o.pausedAt === "number" ? o.pausedAt : null,
    lastActiveAt: typeof o.lastActiveAt === "number" ? o.lastActiveAt : null,
    lastDoneId: typeof o.lastDoneId === "string" ? o.lastDoneId : null,
    lastDoneTitle: typeof o.lastDoneTitle === "string" ? o.lastDoneTitle : null,
    activeLane,
    unlockedLanes: unlocked,
  };
}

export function parseProgressJsonText(text: string): ProgressFile {
  return parseProgressFile(JSON.parse(text) as unknown);
}

export function modulesFromInventory(raw: unknown): {
  modules: ModuleId[];
  notes: string;
} {
  const modules = new Set<ModuleId>(["core"]);
  const notes: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { modules: ["core"], notes: "Invalid inventory JSON" };
  }
  const inv = raw as Record<string, unknown>;
  const tools = (inv.tools as Record<string, unknown>) || {};
  const dirs = (inv.dirs as Record<string, unknown>) || {};
  const flags = (inv.flags as Record<string, unknown>) || {};

  const has = (k: string) => {
    const t = tools[k];
    if (t && typeof t === "object" && (t as { present?: boolean }).present) return true;
    return false;
  };

  if (has("claude") || flags.claudeDir) {
    modules.add("claude");
    notes.push("Claude Code detected");
  }
  if (has("codex") || flags.codexDir) {
    modules.add("codex");
    notes.push("Codex detected");
  }
  if (has("grok")) {
    modules.add("grok");
    notes.push("Grok CLI detected");
  }
  if (has("muse")) {
    modules.add("muse");
    notes.push("Muse detected");
  }
  if (has("adb") || has("java") || flags.androidHome || flags.gradleHome) {
    modules.add("android");
    notes.push("Android / Java / Gradle signals");
  }
  if (
    flags.daylightHits ||
    (Array.isArray(dirs.daylight) && (dirs.daylight as unknown[]).length)
  ) {
    modules.add("daylight");
    notes.push("Daylight / DC1 paths found");
  }
  if (flags.sshPubKeys) {
    modules.add("ssh");
    notes.push("SSH public keys present");
  }
  modules.add("permissions");
  modules.add("chrome");
  modules.add("transfer");
  modules.add("ssh");

  return {
    modules: Array.from(modules),
    notes: notes.length ? notes.join(" · ") : "Minimal inventory — core only plus defaults",
  };
}
