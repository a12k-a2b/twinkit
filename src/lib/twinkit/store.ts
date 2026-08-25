import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MODULES } from "./modules";
import { SECTIONS } from "./checklist";
import { buildProgressFile, parseProgressFile } from "./progress-io";
import { SIMPLE_PRESETS } from "./presets";
import { laneForItem } from "./item-meta";
import type { ProfilePreset } from "./types";
import type {
  AppStep,
  LaneId,
  ManifestSummary,
  ModuleId,
  NextOpen,
  ParityReport,
  Phase,
  ProgressFile,
  ProgressState,
  SessionBudgetMin,
  StatsResult,
} from "./types";
import {
  playCheck,
  playFanfare,
  playSectionComplete,
  playSkip,
  playYeet,
} from "./sounds";

export function sessionElapsedMs(
  sessionStartedAt: number | null,
  paused: boolean,
  pausedAt: number | null,
  now: number,
): number {
  if (!sessionStartedAt) return 0;
  const end = paused && pausedAt ? pausedAt : now;
  return Math.max(0, end - sessionStartedAt);
}

export function shiftedSessionStart(
  sessionStartedAt: number | null,
  pausedAt: number | null,
  now: number,
): number {
  if (!sessionStartedAt) return now;
  if (!pausedAt) return sessionStartedAt;
  return sessionStartedAt + Math.max(0, now - pausedAt);
}

const defaultModules = MODULES.filter((m) => m.defaultOn).map((m) => m.id);
const DEFAULT_PRESET = SIMPLE_PRESETS[0]!;

const initial: ProgressState = {
  checked: {},
  skipped: {},
  acceptedGaps: {},
  checkedAt: {},
  enabledModules: defaultModules,
  mode: "unpack",
  step: "welcome",
  soundOn: false,
  yeeted: false,
  startedAt: null,
  completedAt: null,
  celebratedSections: [],
  packLabel: null,
  discoverNotes: null,
  profileId: null,
  paused: false,
  pausedAt: null,
  lastActiveAt: null,
  focusMode: true,
  parity: null,
  manifest: null,
  simpleUi: true,
  sprintMode: true,
  showMountain: false,
  hypeOn: false,
  activeLane: "must",
  unlockedLanes: ["must"],
  sessionBudgetMin: 15,
  sessionStartedAt: null,
  sessionChecksAtStart: 0,
  sessionExtraMin: 0,
  lastDoneId: null,
  lastDoneTitle: null,
  currentItemStartedAt: null,
  lastExportedAt: null,
  bodyDouble: false,
};

function itemActive(itemModules: ModuleId[], enabled: ModuleId[]): boolean {
  if (itemModules.length === 0) return true;
  return itemModules.every((m) => enabled.includes(m));
}

export function getVisibleSections(
  mode: ProgressState["mode"],
  enabled: ModuleId[],
) {
  const phases: Phase[] =
    mode === "both" ? ["pack", "unpack"] : mode === "pack" ? ["pack"] : ["unpack"];

  return SECTIONS.filter((s) => {
    if (!phases.includes(s.phase)) return false;
    if (!s.modules.some((m) => enabled.includes(m))) return false;
    const items = s.items.filter((it) => itemActive(it.modules, enabled));
    return items.length > 0;
  }).map((s) => ({
    ...s,
    items: s.items.filter((it) => itemActive(it.modules, enabled)),
  }));
}

export function computeStats(
  state: ProgressState,
  laneFilter?: LaneId,
): StatsResult {
  const sections = getVisibleSections(state.mode, state.enabledModules).map(
    (s) => ({
      ...s,
      items: laneFilter
        ? s.items.filter((it) => laneForItem(it) === laneFilter)
        : s.items,
    }),
  ).filter((s) => s.items.length > 0);

  let totalItems = 0;
  let checkedItems = 0;
  let skippedItems = 0;
  let openItems = 0;
  let unacceptedGaps = 0;
  let totalMin = 0;
  let remainingMin = 0;

  const sectionStats = sections.map((s) => {
    let sTotal = 0;
    let sChecked = 0;
    let sSkipped = 0;
    let sOpen = 0;
    let sMin = 0;
    let sRem = 0;
    for (const it of s.items) {
      sTotal += 1;
      sMin += it.minutes;
      const isChecked = !!state.checked[it.id];
      const isSkipped = !!state.skipped[it.id];
      if (isChecked) {
        sChecked += 1;
      } else if (isSkipped) {
        sSkipped += 1;
        if (!state.acceptedGaps[it.id]) unacceptedGaps += 1;
      } else {
        sOpen += 1;
        sRem += it.minutes;
      }
    }
    totalItems += sTotal;
    checkedItems += sChecked;
    skippedItems += sSkipped;
    openItems += sOpen;
    totalMin += sMin;
    remainingMin += sRem;
    return {
      id: s.id,
      total: sTotal,
      checked: sChecked,
      skipped: sSkipped,
      open: sOpen,
      minutes: sMin,
      remaining: sRem,
      resolved: sTotal > 0 && sOpen === 0,
      perfect: sTotal > 0 && sChecked === sTotal,
    };
  });

  const pct =
    totalItems === 0 ? 0 : Math.round((checkedItems / totalItems) * 100);
  const twinReady =
    totalItems > 0 &&
    openItems === 0 &&
    unacceptedGaps === 0;

  return {
    sections,
    sectionStats,
    totalItems,
    checkedItems,
    skippedItems,
    openItems,
    unacceptedGaps,
    totalMin,
    remainingMin,
    pct,
    twinReady,
  };
}

export function getNextOpenItem(
  state: ProgressState,
  lane: LaneId = state.activeLane,
): NextOpen | null {
  const sections = getVisibleSections(state.mode, state.enabledModules);
  for (const s of sections) {
    for (const it of s.items) {
      if (laneForItem(it) !== lane) continue;
      if (!state.checked[it.id] && !state.skipped[it.id]) {
        return {
          item: it,
          sectionId: s.id,
          sectionTitle: s.title,
          lane,
        };
      }
    }
  }
  return null;
}

export function findItemTitle(id: string | null): string | null {
  if (!id) return null;
  for (const s of SECTIONS) {
    const it = s.items.find((x) => x.id === id);
    if (it) return it.title;
  }
  return null;
}

export function isDirty(state: ProgressState): boolean {
  if (!state.lastActiveAt) return false;
  if (!state.lastExportedAt) return (state.startedAt != null);
  return state.lastActiveAt > state.lastExportedAt + 2000;
}

interface TwinActions {
  setStep: (step: AppStep) => void;
  setMode: (mode: ProgressState["mode"]) => void;
  toggleModule: (id: ModuleId) => void;
  setModules: (ids: ModuleId[]) => void;
  toggleSound: () => void;
  toggleHype: () => void;
  toggleItem: (id: string, sectionId: string, title?: string) => void;
  skipItem: (id: string, sectionId: string) => void;
  doesntApply: (id: string, sectionId: string) => void;
  resetItem: (id: string) => void;
  acceptGap: (id: string) => void;
  unacceptGap: (id: string) => void;
  acceptAllGaps: () => void;
  markSectionCelebrated: (id: string) => void;
  startMission: () => void;
  startSimple: (
    mode: "pack" | "unpack",
    preset?: ProfilePreset,
    budget?: SessionBudgetMin,
    bodyDouble?: boolean,
  ) => void;
  startSession: (budget: SessionBudgetMin, bodyDouble?: boolean) => void;
  addFiveMinutes: () => void;
  endSession: () => void;
  completeMission: () => boolean;
  yeet: () => void;
  unyeet: () => void;
  resetAll: () => void;
  exportProgress: () => ProgressFile;
  markExported: () => void;
  importProgress: (file: ProgressFile) => void;
  setPackLabel: (label: string | null) => void;
  applyDiscover: (modules: ModuleId[], notes: string) => void;
  applyPreset: (preset: ProfilePreset) => void;
  pauseMission: () => void;
  resumeMission: () => void;
  touchActive: () => void;
  touchCurrentItem: () => void;
  toggleFocusMode: () => void;
  toggleSimpleUi: () => void;
  toggleMountain: () => void;
  setSprintMode: (on: boolean) => void;
  unlockLane: (lane: LaneId) => void;
  setActiveLane: (lane: LaneId) => void;
  setParity: (report: ParityReport | null) => void;
  setManifest: (manifest: ManifestSummary | null) => void;
}

function maybeCelebrateSection(
  get: () => ProgressState & TwinActions,
  set: (p: Partial<ProgressState>) => void,
  sectionId: string,
  soundOn: boolean,
) {
  const { sectionStats } = computeStats(get());
  const sec = sectionStats.find((s) => s.id === sectionId);
  if (sec?.resolved && !get().celebratedSections.includes(sectionId)) {
    if (soundOn) playSectionComplete();
    set({ celebratedSections: [...get().celebratedSections, sectionId] });
  }
}

function maybeTwinReady(
  get: () => ProgressState & TwinActions,
  set: (p: Partial<ProgressState>) => void,
  soundOn: boolean,
) {
  const { twinReady } = computeStats(get());
  if (twinReady && !get().completedAt) {
    if (soundOn) playFanfare();
    set({ completedAt: Date.now(), step: "complete", paused: false });
  }
}

export const useTwinStore = create<ProgressState & TwinActions>()(
  persist(
    (set, get) => ({
      ...initial,

      setStep: (step) => set({ step, lastActiveAt: Date.now() }),
      setMode: (mode) => set({ mode }),
      toggleSound: () => set({ soundOn: !get().soundOn }),
      toggleHype: () => set({ hypeOn: !get().hypeOn }),
      setModules: (ids) => set({ enabledModules: ids.length ? ids : ["core"] }),
      setPackLabel: (packLabel) => set({ packLabel }),
      touchActive: () => set({ lastActiveAt: Date.now() }),
      touchCurrentItem: () =>
        set({
          currentItemStartedAt: Date.now(),
          lastActiveAt: Date.now(),
        }),
      toggleFocusMode: () => set({ focusMode: !get().focusMode }),
      toggleSimpleUi: () => set({ simpleUi: !get().simpleUi }),
      toggleMountain: () => set({ showMountain: !get().showMountain }),
      setSprintMode: (on) => set({ sprintMode: on, showMountain: !on }),
      setParity: (parity) => set({ parity, lastActiveAt: Date.now() }),
      setManifest: (manifest) => set({ manifest, lastActiveAt: Date.now() }),

      unlockLane: (lane) => {
        const unlocked = get().unlockedLanes.includes(lane)
          ? get().unlockedLanes
          : [...get().unlockedLanes, lane];
        set({
          unlockedLanes: unlocked,
          activeLane: lane,
          lastActiveAt: Date.now(),
        });
      },
      setActiveLane: (lane) => {
        if (!get().unlockedLanes.includes(lane)) return;
        set({ activeLane: lane, currentItemStartedAt: Date.now() });
      },

      toggleModule: (id) => {
        if (id === "core") return;
        const cur = get().enabledModules;
        const next = cur.includes(id)
          ? cur.filter((m) => m !== id)
          : [...cur, id];
        if (!next.includes("core")) next.unshift("core");
        set({ enabledModules: next, profileId: null });
      },

      applyDiscover: (modules, notes) => {
        const next: ModuleId[] = modules.includes("core")
          ? [...modules]
          : ["core", ...modules];
        set({
          enabledModules: next,
          discoverNotes: notes,
          profileId: "discover",
          lastActiveAt: Date.now(),
        });
      },

      applyPreset: (preset) => {
        const modules = preset.modules.includes("core")
          ? [...preset.modules]
          : (["core", ...preset.modules] as ModuleId[]);
        set({
          enabledModules: modules,
          profileId: preset.id,
          mode: preset.mode ?? get().mode,
          discoverNotes: null,
          lastActiveAt: Date.now(),
        });
      },

      pauseMission: () =>
        set({
          paused: true,
          pausedAt: Date.now(),
          lastActiveAt: Date.now(),
        }),

      resumeMission: () => {
        const s = get();
        const nextStart = shiftedSessionStart(
          s.sessionStartedAt,
          s.pausedAt,
          Date.now(),
        );
        set({
          paused: false,
          pausedAt: null,
          step: "mission",
          sprintMode: true,
          lastActiveAt: Date.now(),
          currentItemStartedAt: Date.now(),
          sessionStartedAt: nextStart,
        });
      },

      toggleItem: (id, sectionId, title) => {
        const { checked, skipped, acceptedGaps, checkedAt, soundOn } = get();
        const was = !!checked[id];
        const nextChecked = { ...checked, [id]: !was };
        const nextCheckedAt = { ...checkedAt };
        if (!was) {
          const nextSkipped = { ...skipped };
          const nextGaps = { ...acceptedGaps };
          delete nextSkipped[id];
          delete nextGaps[id];
          nextCheckedAt[id] = Date.now();
          set({
            checked: nextChecked,
            skipped: nextSkipped,
            acceptedGaps: nextGaps,
            checkedAt: nextCheckedAt,
            lastActiveAt: Date.now(),
            paused: false,
            lastDoneId: id,
            lastDoneTitle: title ?? findItemTitle(id),
            currentItemStartedAt: Date.now(),
          });
          if (soundOn) playCheck();
          maybeCelebrateSection(get, set, sectionId, soundOn);
          maybeTwinReady(get, set, soundOn);
        } else {
          delete nextCheckedAt[id];
          set({
            checked: nextChecked,
            checkedAt: nextCheckedAt,
            lastActiveAt: Date.now(),
          });
        }
      },

      skipItem: (id, sectionId) => {
        const { skipped, checked, acceptedGaps, checkedAt, soundOn } = get();
        const nextSkipped = { ...skipped, [id]: true };
        const nextChecked = { ...checked };
        const nextGaps = { ...acceptedGaps };
        const nextCheckedAt = { ...checkedAt };
        delete nextChecked[id];
        delete nextGaps[id];
        delete nextCheckedAt[id];
        set({
          skipped: nextSkipped,
          checked: nextChecked,
          acceptedGaps: nextGaps,
          checkedAt: nextCheckedAt,
          lastActiveAt: Date.now(),
          currentItemStartedAt: Date.now(),
        });
        if (soundOn) playSkip();
        maybeCelebrateSection(get, set, sectionId, soundOn);
      },

      doesntApply: (id, sectionId) => {
        const { skipped, checked, acceptedGaps, checkedAt, soundOn } = get();
        const nextSkipped = { ...skipped, [id]: true };
        const nextChecked = { ...checked };
        const nextCheckedAt = { ...checkedAt };
        delete nextChecked[id];
        delete nextCheckedAt[id];
        set({
          skipped: nextSkipped,
          checked: nextChecked,
          acceptedGaps: { ...acceptedGaps, [id]: true },
          checkedAt: nextCheckedAt,
          lastActiveAt: Date.now(),
          currentItemStartedAt: Date.now(),
        });
        if (soundOn) playSkip();
        maybeCelebrateSection(get, set, sectionId, soundOn);
        maybeTwinReady(get, set, soundOn);
      },

      resetItem: (id) => {
        const checked = { ...get().checked };
        const skipped = { ...get().skipped };
        const acceptedGaps = { ...get().acceptedGaps };
        const checkedAt = { ...get().checkedAt };
        delete checked[id];
        delete skipped[id];
        delete acceptedGaps[id];
        delete checkedAt[id];
        set({
          checked,
          skipped,
          acceptedGaps,
          checkedAt,
          completedAt: null,
          lastActiveAt: Date.now(),
        });
      },

      acceptGap: (id) => {
        if (!get().skipped[id]) return;
        set({
          acceptedGaps: { ...get().acceptedGaps, [id]: true },
          lastActiveAt: Date.now(),
        });
        maybeTwinReady(get, set, get().soundOn);
      },

      unacceptGap: (id) => {
        const acceptedGaps = { ...get().acceptedGaps };
        delete acceptedGaps[id];
        set({ acceptedGaps, completedAt: null, lastActiveAt: Date.now() });
      },

      acceptAllGaps: () => {
        const { skipped, soundOn } = get();
        const acceptedGaps = { ...get().acceptedGaps };
        for (const id of Object.keys(skipped)) {
          if (skipped[id]) acceptedGaps[id] = true;
        }
        set({ acceptedGaps, lastActiveAt: Date.now() });
        maybeTwinReady(get, set, soundOn);
      },

      markSectionCelebrated: (id) => {
        if (get().celebratedSections.includes(id)) return;
        set({ celebratedSections: [...get().celebratedSections, id] });
      },

      startMission: () =>
        set({
          step: "mission",
          startedAt: get().startedAt ?? Date.now(),
          yeeted: false,
          completedAt: null,
          paused: false,
          pausedAt: null,
          lastActiveAt: Date.now(),
          sprintMode: true,
          sessionStartedAt: Date.now(),
          sessionChecksAtStart: Object.values(get().checked).filter(Boolean).length,
          currentItemStartedAt: Date.now(),
        }),

      startSimple: (mode, preset = DEFAULT_PRESET, budget = 15, bodyDouble = false) => {
        const modules = preset.modules.includes("core")
          ? [...preset.modules]
          : (["core", ...preset.modules] as ModuleId[]);
        set({
          mode,
          enabledModules: modules,
          profileId: preset.id,
          step: "mission",
          startedAt: Date.now(),
          yeeted: false,
          completedAt: null,
          paused: false,
          pausedAt: null,
          lastActiveAt: Date.now(),
          simpleUi: true,
          sprintMode: true,
          showMountain: false,
          hypeOn: false,
          focusMode: true,
          discoverNotes: null,
          activeLane: "must",
          unlockedLanes: ["must"],
          sessionBudgetMin: budget,
          sessionStartedAt: Date.now(),
          sessionChecksAtStart: 0,
          sessionExtraMin: 0,
          bodyDouble,
          currentItemStartedAt: Date.now(),
          checked: {},
          skipped: {},
          acceptedGaps: {},
          checkedAt: {},
          celebratedSections: [],
          lastDoneId: null,
          lastDoneTitle: null,
        });
      },

      startSession: (budget, bodyDouble = budget === 25) =>
        set({
          sessionBudgetMin: budget,
          sessionStartedAt: Date.now(),
          sessionChecksAtStart: Object.values(get().checked).filter(Boolean).length,
          sessionExtraMin: 0,
          bodyDouble,
          paused: false,
          step: "mission",
          sprintMode: true,
          lastActiveAt: Date.now(),
          currentItemStartedAt: Date.now(),
        }),

      addFiveMinutes: () =>
        set({
          sessionExtraMin: get().sessionExtraMin + 5,
          lastActiveAt: Date.now(),
        }),

      endSession: () =>
        set({
          step: "session-win",
          paused: true,
          lastActiveAt: Date.now(),
        }),

      completeMission: () => {
        const { twinReady } = computeStats(get());
        if (!twinReady) return false;
        if (get().soundOn) playFanfare();
        set({
          completedAt: Date.now(),
          step: "complete",
          paused: false,
          lastActiveAt: Date.now(),
        });
        return true;
      },

      yeet: () => {
        if (get().soundOn) playYeet();
        set({ yeeted: true, step: "welcome" });
      },

      unyeet: () => set({ yeeted: false }),

      resetAll: () =>
        set({
          ...initial,
          soundOn: get().soundOn,
          hypeOn: get().hypeOn,
        }),

      exportProgress: () => buildProgressFile(get()),
      markExported: () => set({ lastExportedAt: Date.now() }),

      importProgress: (file) => {
        const parsed = parseProgressFile(file);
        set({
          mode: parsed.mode,
          enabledModules: parsed.enabledModules,
          checked: parsed.checked,
          skipped: parsed.skipped,
          acceptedGaps: parsed.acceptedGaps,
          checkedAt: parsed.checkedAt ?? {},
          startedAt: parsed.startedAt ?? Date.now(),
          completedAt: parsed.completedAt,
          celebratedSections: parsed.celebratedSections,
          packLabel: parsed.packLabel ?? "imported",
          profileId: parsed.profileId ?? null,
          paused: parsed.paused ?? false,
          pausedAt: parsed.pausedAt ?? null,
          lastActiveAt: parsed.lastActiveAt ?? Date.now(),
          lastDoneId: parsed.lastDoneId ?? null,
          lastDoneTitle: parsed.lastDoneTitle ?? null,
          activeLane: parsed.activeLane ?? "must",
          unlockedLanes: parsed.unlockedLanes ?? ["must"],
          yeeted: false,
          lastExportedAt: Date.now(),
          step: parsed.completedAt ? "complete" : "mission",
          sprintMode: true,
        });
      },
    }),
    {
      name: "twinkit-progress-v6",
      partialize: (s) => ({
        checked: s.checked,
        skipped: s.skipped,
        acceptedGaps: s.acceptedGaps,
        checkedAt: s.checkedAt,
        enabledModules: s.enabledModules,
        mode: s.mode,
        step: s.step,
        soundOn: s.soundOn,
        yeeted: s.yeeted,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        celebratedSections: s.celebratedSections,
        packLabel: s.packLabel,
        discoverNotes: s.discoverNotes,
        profileId: s.profileId,
        paused: s.paused,
        pausedAt: s.pausedAt,
        lastActiveAt: s.lastActiveAt,
        focusMode: s.focusMode,
        parity: s.parity,
        manifest: s.manifest,
        simpleUi: s.simpleUi,
        sprintMode: s.sprintMode,
        showMountain: s.showMountain,
        hypeOn: s.hypeOn,
        activeLane: s.activeLane,
        unlockedLanes: s.unlockedLanes,
        sessionBudgetMin: s.sessionBudgetMin,
        sessionStartedAt: s.sessionStartedAt,
        sessionChecksAtStart: s.sessionChecksAtStart,
        sessionExtraMin: s.sessionExtraMin,
        lastDoneId: s.lastDoneId,
        lastDoneTitle: s.lastDoneTitle,
        lastExportedAt: s.lastExportedAt,
        bodyDouble: s.bodyDouble,
      }),
    },
  ),
);
