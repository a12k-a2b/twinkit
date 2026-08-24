"use client";

import { useEffect, useState } from "react";
import { Confetti } from "./Confetti";
import { computeStats, isDirty, useTwinStore } from "@/lib/twinkit/store";
import { downloadJson } from "@/lib/twinkit/scripts";
import { playFanfare, unlockAudio } from "@/lib/twinkit/sounds";

export function SessionWin() {
  const state = useTwinStore();
  const stats = computeStats(state);
  const startSession = useTwinStore((s) => s.startSession);
  const addFiveMinutes = useTwinStore((s) => s.addFiveMinutes);
  const setStep = useTwinStore((s) => s.setStep);
  const resumeMission = useTwinStore((s) => s.resumeMission);
  const exportProgress = useTwinStore((s) => s.exportProgress);
  const markExported = useTwinStore((s) => s.markExported);
  const soundOn = useTwinStore((s) => s.soundOn);
  const dirty = isDirty(state);
  const [confetti, setConfetti] = useState(true);

  const doneThis =
    Math.max(0, stats.checkedItems - state.sessionChecksAtStart);

  useEffect(() => {
    void unlockAudio();
    if (soundOn) playFanfare();
    const t = window.setTimeout(() => setConfetti(false), 3500);
    return () => window.clearTimeout(t);
  }, [soundOn]);

  return (
    <div className="relative mx-auto flex min-h-[70dvh] w-full max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <Confetti active={confetti} />
      <div className="w-full space-y-5 rounded-2xl border border-success/35 bg-bg-elevated p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-success">
          Sprint complete
        </p>
        <h2 className="font-display text-3xl font-semibold text-fg">
          That’s a real win.
        </h2>
        <p className="text-sm leading-relaxed text-fg-muted">
          {doneThis} step{doneThis === 1 ? "" : "s"} this sprint
          {stats.openItems ? ` · ${stats.openItems} still open for another day` : ""}.
          Stopping is the feature.
        </p>

        {dirty && (
          <p className="rounded-lg border border-warn/40 px-3 py-2 text-xs text-warn">
            Save progress.json into the pack folder before you close this tab.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg"
            onClick={() => {
              downloadJson("progress.json", exportProgress());
              markExported();
            }}
          >
            Save progress
          </button>
          <button
            type="button"
            className="rounded-xl border border-border py-3 text-sm font-medium text-fg hover:bg-bg-hover"
            onClick={() => setStep("welcome")}
          >
            That’s enough for today
          </button>
          <button
            type="button"
            className="rounded-xl border border-border py-3 text-sm font-medium text-fg-muted hover:bg-bg-hover hover:text-fg"
            onClick={() => startSession(state.sessionBudgetMin, state.bodyDouble)}
          >
            One more sprint
          </button>
          <button
            type="button"
            className="text-xs text-fg-subtle hover:text-fg-muted"
            onClick={() => {
              addFiveMinutes();
              resumeMission();
            }}
          >
            +5 minutes, same step
          </button>
        </div>
      </div>
    </div>
  );
}
