export type Phase = "pack" | "unpack";

export type ModuleId =
  | "core"
  | "claude"
  | "codex"
  | "grok"
  | "muse"
  | "android"
  | "daylight"
  | "chrome"
  | "permissions"
  | "ssh"
  | "transfer";

export type ItemKind =
  | "manual"
  | "script"
  | "auth"
  | "permission"
  | "verify"
  | "download";

export type LaneId = "must" | "later" | "polish";

export type SessionBudgetMin = 15 | 25 | 30 | 60;

export type ScriptKey = "discover" | "pack" | "unpack" | "verify" | "skill";

export interface ChecklistItem {
  id: string;
  title: string;
  detail: string;
  minutes: number;
  kind: ItemKind;
  modules: ModuleId[];
  phases: Phase[];
  hint?: string;
  command?: string;
}

export interface ChecklistSection {
  id: string;
  title: string;
  blurb: string;
  phase: Phase;
  modules: ModuleId[];
  items: ChecklistItem[];
  encouragements: string[];
}

export interface ModuleDef {
  id: ModuleId;
  label: string;
  description: string;
  defaultOn: boolean;
  minutesHint: number;
}

export type AppStep =
  | "welcome"
  | "modules"
  | "mission"
  | "toolkit"
  | "companion"
  | "session-win"
  | "complete";

export const TWINKIT_VERSION = "0.5.0";
export const PROGRESS_FILE_VERSION = 4;

export type ParityStatus = "pass" | "warn" | "fail" | "skip";

export interface ParityResult {
  status: ParityStatus;
  name: string;
  detail: string;
}

export interface ParityReport {
  twinkit?: string;
  generatedAt?: string;
  pass: number;
  warn: number;
  fail: number;
  ok?: boolean;
  results: ParityResult[];
  source: "json" | "markdown";
}

export interface ManifestTool {
  name: string;
  versionLine: string;
  presentOnPack: boolean;
  installHint?: string;
}

export interface ManifestSummary {
  host?: string;
  arch?: string;
  macos?: string;
  packedAt?: string;
  tools: ManifestTool[];
  rawPreview: string;
}

export interface ProgressState {
  checked: Record<string, boolean>;
  skipped: Record<string, boolean>;
  acceptedGaps: Record<string, boolean>;
  checkedAt: Record<string, number>;
  enabledModules: ModuleId[];
  mode: "both" | "pack" | "unpack";
  step: AppStep;
  soundOn: boolean;
  yeeted: boolean;
  startedAt: number | null;
  completedAt: number | null;
  celebratedSections: string[];
  packLabel: string | null;
  discoverNotes: string | null;
  profileId: string | null;
  paused: boolean;
  pausedAt: number | null;
  lastActiveAt: number | null;
  focusMode: boolean;
  parity: ParityReport | null;
  manifest: ManifestSummary | null;
  simpleUi: boolean;
  /** ADHD: full-screen one step (default) */
  sprintMode: boolean;
  /** Show the 19-section mountain */
  showMountain: boolean;
  /** Rotating quips — off by default */
  hypeOn: boolean;
  activeLane: LaneId;
  unlockedLanes: LaneId[];
  sessionBudgetMin: SessionBudgetMin;
  sessionStartedAt: number | null;
  sessionChecksAtStart: number;
  sessionExtraMin: number;
  lastDoneId: string | null;
  lastDoneTitle: string | null;
  currentItemStartedAt: number | null;
  lastExportedAt: number | null;
  bodyDouble: boolean;
}

export interface ProgressFile {
  version: number;
  twinkit: string;
  exportedAt: string;
  mode: ProgressState["mode"];
  enabledModules: ModuleId[];
  checked: Record<string, boolean>;
  skipped: Record<string, boolean>;
  acceptedGaps: Record<string, boolean>;
  checkedAt?: Record<string, number>;
  startedAt: number | null;
  completedAt: number | null;
  celebratedSections: string[];
  packLabel?: string | null;
  profileId?: string | null;
  paused?: boolean;
  pausedAt?: number | null;
  lastActiveAt?: number | null;
  lastDoneId?: string | null;
  lastDoneTitle?: string | null;
  activeLane?: LaneId;
  unlockedLanes?: LaneId[];
}

export interface StatsResult {
  sections: ChecklistSection[];
  sectionStats: Array<{
    id: string;
    total: number;
    checked: number;
    skipped: number;
    open: number;
    minutes: number;
    remaining: number;
    resolved: boolean;
    perfect: boolean;
  }>;
  totalItems: number;
  checkedItems: number;
  skippedItems: number;
  openItems: number;
  unacceptedGaps: number;
  totalMin: number;
  remainingMin: number;
  pct: number;
  twinReady: boolean;
}

export interface ProfilePreset {
  id: string;
  label: string;
  description: string;
  modules: ModuleId[];
  mode?: ProgressState["mode"];
  simpleLabel?: string;
}

export interface NextOpen {
  item: ChecklistItem;
  sectionId: string;
  sectionTitle: string;
  lane: LaneId;
}
