"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  Pause,
  Play,
} from "lucide-react";
import {
  computeStats,
  getNextOpenItem,
  isDirty,
  sessionElapsedMs,
  useTwinStore,
} from "@/lib/twinkit/store";
import {
  LANE_SHORT,
  SCRIPT_FILES,
  authUrlFor,
  laneForItem,
  scriptKeyFor,
  settingsUrlFor,
  stuckHintFor,
} from "@/lib/twinkit/item-meta";
import { formatMinutes, kindLabel } from "@/lib/twinkit/format";
import { computePace, personalRemaining } from "@/lib/twinkit/pace";
import type { LaneId, ScriptKey } from "@/lib/twinkit/types";
import {
  TWIN_DISCOVER_SH,
  TWIN_PACK_SH,
  TWIN_UNPACK_SH,
  TWIN_VERIFY_SH,
  TWINKIT_SKILL_MD,
  downloadJson,
  downloadText,
} from "@/lib/twinkit/scripts";
import { unlockAudio } from "@/lib/twinkit/sounds";
import type { ChecklistItem } from "@/lib/twinkit/types";

const SCRIPT_BODY: Record<ScriptKey, string> = {
  discover: TWIN_DISCOVER_SH,
  pack: TWIN_PACK_SH,
  unpack: TWIN_UNPACK_SH,
  verify: TWIN_VERIFY_SH,
  skill: TWINKIT_SKILL_MD,
};

export function SprintScreen() {
  const state = useTwinStore();
  const stats = computeStats(state);
  const laneStats = computeStats(state, state.activeLane);
  const next = getNextOpenItem(state);
  const endSession = useTwinStore((s) => s.endSession);
  const pauseMission = useTwinStore((s) => s.pauseMission);
  const resumeMission = useTwinStore((s) => s.resumeMission);
  const unlockLane = useTwinStore((s) => s.unlockLane);
  const setActiveLane = useTwinStore((s) => s.setActiveLane);
  const toggleMountain = useTwinStore((s) => s.toggleMountain);
  const toggleHype = useTwinStore((s) => s.toggleHype);
  const setStep = useTwinStore((s) => s.setStep);
  const exportProgress = useTwinStore((s) => s.exportProgress);
  const markExported = useTwinStore((s) => s.markExported);
  const startSession = useTwinStore((s) => s.startSession);
  const [now, setNow] = useState(Date.now());
  const [nudge, setNudge] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  // Fresh timer only. An expired stamp restores the win screen — never a new sprint.
  useEffect(() => {
    if (state.step !== "mission") return;
    if (state.paused && state.step === "mission") return;
    const budget =
      (state.sessionBudgetMin + state.sessionExtraMin) * 60 * 1000;
    if (!state.sessionStartedAt) {
      startSession(state.sessionBudgetMin || 15, state.bodyDouble);
    } else if (Date.now() - state.sessionStartedAt >= budget && !state.paused) {
      endSession();
    }
    const arm = window.setTimeout(() => setArmed(true), 2000);
    return () => window.clearTimeout(arm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  const budgetMs =
    (state.sessionBudgetMin + state.sessionExtraMin) * 60 * 1000;
  const elapsedMs = sessionElapsedMs(
    state.sessionStartedAt,
    state.paused,
    state.pausedAt,
    now,
  );
  const remainMs = Math.max(0, budgetMs - elapsedMs);
  const remainLabel = formatClock(remainMs);

  useEffect(() => {
    if (!armed) return;
    if (
      state.sessionStartedAt &&
      !state.paused &&
      remainMs <= 0 &&
      state.step === "mission"
    ) {
      endSession();
    }
  }, [armed, remainMs, state.paused, state.sessionStartedAt, state.step, endSession]);

  const dirty = isDirty(state);
  useEffect(() => {
    if (!dirty) return;
    if (state.paused) setNudge(true);
    const idle = state.lastActiveAt && now - state.lastActiveAt > 30 * 60 * 1000;
    if (idle) setNudge(true);
  }, [dirty, state.paused, state.lastActiveAt, now]);

  const pace = computePace(
    state.checkedAt,
    stats.sections.flatMap((s) => s.items),
  );
  const paceRemain = personalRemaining(laneStats.remainingMin, pace?.ratio ?? null);

  const sessionDone =
    stats.checkedItems - state.sessionChecksAtStart;

  const laterWaiting = computeStats(state, "later").openItems;
  const polishWaiting = computeStats(state, "polish").openItems;

  return (
    <div className="mx-auto flex min-h-[80dvh] w-full max-w-lg flex-col px-4 pb-16 pt-24">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
            {state.bodyDouble ? "Body double" : "Sprint"} · {state.sessionBudgetMin} min
            {state.paused ? " · paused" : ""}
          </p>
          <p className="mt-0.5 font-display text-2xl font-semibold tabular text-fg">
            {remainLabel}
            <span className="ml-2 text-sm font-normal text-fg-muted">
              left
            </span>
          </p>
          <p className="text-xs text-fg-muted">
            {laneStats.checkedItems}/{laneStats.totalItems} this lane
            {pace ? ` · ${pace.label}` : ""}
            {pace ? ` · ~${formatMinutes(paceRemain)} your pace` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded-xl border border-border px-2.5 py-2 text-xs text-fg hover:bg-bg-hover"
            onClick={() => (state.paused ? resumeMission() : pauseMission())}
          >
            {state.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
        </div>
      </header>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-progress-track">
        <div
          className="h-full rounded-full bg-progress transition-[width] duration-300"
          style={{
            width: `${Math.min(100, (elapsedMs / Math.max(1, budgetMs)) * 100)}%`,
          }}
        />
      </div>

      {(dirty || nudge) && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-bg-elevated px-3 py-2.5 text-sm text-fg-muted">
          Progress isn’t saved to a file yet.
          <button
            type="button"
            className="ml-2 font-semibold text-success hover:underline"
            onClick={() => {
              downloadJson("progress.json", exportProgress());
              markExported();
              setNudge(false);
            }}
          >
            Save now
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["must", "later", "polish"] as LaneId[]).map((lane) => {
          const unlocked = state.unlockedLanes.includes(lane);
          const on = state.activeLane === lane;
          const extra =
            lane === "later" ? laterWaiting : lane === "polish" ? polishWaiting : 0;
          if (lane !== "must" && extra === 0 && !unlocked) return null;
          return (
            <button
              key={lane}
              type="button"
              onClick={() => (unlocked ? setActiveLane(lane) : unlockLane(lane))}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                on
                  ? "bg-accent text-accent-fg"
                  : unlocked
                    ? "border border-border text-fg-muted hover:bg-bg-hover"
                    : "border border-dashed border-border text-fg-subtle"
              }`}
            >
              {unlocked ? LANE_SHORT[lane] : `Unlock ${LANE_SHORT[lane]}`}
              {lane !== "must" && extra ? ` (${extra})` : ""}
            </button>
          );
        })}
      </div>

      {state.paused && (
        <div className="mb-4 rounded-xl border border-border bg-bg-elevated p-4 text-sm text-fg-muted">
          Paused. Walk away.{" "}
          <button
            type="button"
            className="font-medium text-success hover:underline"
            onClick={() => resumeMission()}
          >
            Resume this step
          </button>
        </div>
      )}

      {next && !state.paused && (
        <StepCard
          item={next.item}
          sectionId={next.sectionId}
          sectionTitle={next.sectionTitle}
          startedAt={state.currentItemStartedAt}
          now={now}
        />
      )}

      {!next && !state.paused && (
        <LaneClear
          lane={state.activeLane}
          laterWaiting={laterWaiting}
          polishWaiting={polishWaiting}
          twinReady={stats.twinReady}
          unacceptedGaps={stats.unacceptedGaps}
        />
      )}

      <div className="mt-auto flex flex-wrap justify-center gap-3 pt-8 text-xs text-fg-subtle">
        <button type="button" onClick={() => endSession()} className="hover:text-fg-muted">
          End sprint
        </button>
        <button type="button" onClick={() => toggleMountain()} className="hover:text-fg-muted">
          {state.showMountain ? "Hide all steps" : "Show all steps"}
        </button>
        <button type="button" onClick={() => toggleHype()} className="hover:text-fg-muted">
          {state.hypeOn ? "Quiet on" : "Hype off"}
        </button>
        <button type="button" onClick={() => setStep("toolkit")} className="hover:text-fg-muted">
          Scripts
        </button>
        <span className="text-fg-subtle/50">{sessionDone} this sprint</span>
      </div>
    </div>
  );
}

function LaneClear({
  lane,
  laterWaiting,
  polishWaiting,
  twinReady,
  unacceptedGaps,
}: {
  lane: LaneId;
  laterWaiting: number;
  polishWaiting: number;
  twinReady: boolean;
  unacceptedGaps: number;
}) {
  const unlockLane = useTwinStore((s) => s.unlockLane);
  const completeMission = useTwinStore((s) => s.completeMission);
  const endSession = useTwinStore((s) => s.endSession);
  const acceptAllGaps = useTwinStore((s) => s.acceptAllGaps);

  if (twinReady) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success-dim/20 p-5 text-center">
        <p className="text-lg font-semibold text-fg">Lane — and the twin — are done</p>
        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg"
          onClick={() => completeMission()}
        >
          Celebrate
        </button>
      </div>
    );
  }

  if (unacceptedGaps > 0) {
    return (
      <div className="rounded-2xl border border-warn/40 bg-bg-elevated p-5">
        <p className="text-lg font-semibold text-fg">
          {unacceptedGaps} skipped {unacceptedGaps === 1 ? "item" : "items"}
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          Skip-for-now is not done. Accept them as “doesn’t apply”, or they’ll come back.
        </p>
        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg"
          onClick={() => acceptAllGaps()}
        >
          Doesn’t apply — accept the gaps
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-success/30 bg-bg-elevated p-5">
      <p className="text-lg font-semibold text-fg">
        {LANE_SHORT[lane]} lane is clear
      </p>
      <p className="mt-1 text-sm text-fg-muted">
        Agents can work without finishing optional lanes. Unlock only if you have energy.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {laterWaiting > 0 && (
          <button
            type="button"
            className="rounded-xl border border-border py-2.5 text-sm text-fg hover:bg-bg-hover"
            onClick={() => unlockLane("later")}
          >
            Unlock Later ({laterWaiting} Android / DC1)
          </button>
        )}
        {polishWaiting > 0 && (
          <button
            type="button"
            className="rounded-xl border border-border py-2.5 text-sm text-fg hover:bg-bg-hover"
            onClick={() => unlockLane("polish")}
          >
            Unlock Polish ({polishWaiting})
          </button>
        )}
        <button
          type="button"
          className="rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-fg"
          onClick={() => endSession()}
        >
          That’s enough for this sprint
        </button>
      </div>
    </div>
  );
}

function StepCard({
  item,
  sectionId,
  sectionTitle,
  startedAt,
  now,
}: {
  item: ChecklistItem;
  sectionId: string;
  sectionTitle: string;
  startedAt: number | null;
  now: number;
}) {
  const toggleItem = useTwinStore((s) => s.toggleItem);
  const skipItem = useTwinStore((s) => s.skipItem);
  const doesntApply = useTwinStore((s) => s.doesntApply);
  const hypeOn = useTwinStore((s) => s.hypeOn);
  const [copied, setCopied] = useState(false);
  const [stuckOpen, setStuckOpen] = useState(false);
  const onItem = startedAt ? now - startedAt : 0;
  const stuck = onItem > 6 * 60 * 1000;
  const script = scriptKeyFor(item);
  const settings = settingsUrlFor(item);
  const auth = authUrlFor(item);
  const command =
    item.command ??
    (script ? `bash ~/Downloads/${SCRIPT_FILES[script]}` : null);

  useEffect(() => {
    setStuckOpen(false);
    setCopied(false);
  }, [item.id]);

  const copyCmd = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-2xl border border-success/35 bg-gradient-to-b from-success-dim/25 to-bg-elevated p-5 shadow-panel">
      <p className="text-[11px] font-medium uppercase tracking-wide text-success">
        One step · {sectionTitle} · {LANE_SHORT[laneForItem(item)]}
      </p>
      <h2 className="mt-2 text-xl font-semibold leading-snug text-fg">
        {item.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.detail}</p>
      <p className="mt-2 text-xs text-fg-subtle">
        {kindLabel(item.kind)} · ~{formatMinutes(item.minutes)}
        {startedAt ? ` · on this ${formatClock(onItem)}` : ""}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {script && (
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm font-medium text-fg hover:bg-bg-hover"
            onClick={() =>
              downloadText(SCRIPT_FILES[script], SCRIPT_BODY[script])
            }
          >
            <Download className="size-4" />
            Download {SCRIPT_FILES[script]}
          </button>
        )}
        {command && (
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm font-medium text-fg hover:bg-bg-hover"
            onClick={() => copyCmd(command)}
          >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy command"}
          </button>
        )}
        {settings && (
          <a
            href={settings}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm font-medium text-fg hover:bg-bg-hover"
          >
            <ExternalLink className="size-4" />
            Open System Settings
          </a>
        )}
        {auth && (
          <a
            href={auth}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm font-medium text-fg hover:bg-bg-hover"
          >
            <ExternalLink className="size-4" />
            Open sign-in
          </a>
        )}
      </div>

      {(stuck || stuckOpen) && (
        <div className="mt-4 rounded-xl border border-warn/30 bg-bg px-3 py-3 text-sm text-fg-muted">
          <p className="font-medium text-fg">Stuck is allowed.</p>
          <p className="mt-1">{stuckHintFor(item)}</p>
        </div>
      )}

      {!stuck && (
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg-muted"
          onClick={() => setStuckOpen(true)}
        >
          <HelpCircle className="size-3.5" />
          I’m stuck
        </button>
      )}

      {hypeOn && item.hint && (
        <p className="mt-3 text-xs italic text-fg-subtle">{item.hint}</p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-fg"
          onClick={() => {
            void unlockAudio();
            toggleItem(item.id, sectionId, item.title);
          }}
        >
          <Check className="size-4" />
          Done
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-xl border border-border py-2.5 text-sm text-fg-muted hover:bg-bg-hover hover:text-fg"
            onClick={() => {
              void unlockAudio();
              skipItem(item.id, sectionId);
            }}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="rounded-xl border border-border py-2.5 text-sm text-fg-muted hover:bg-bg-hover hover:text-fg"
            onClick={() => {
              void unlockAudio();
              doesntApply(item.id, sectionId);
            }}
          >
            Doesn’t apply
          </button>
        </div>
      </div>
    </div>
  );
}

function formatClock(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
