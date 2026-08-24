"use client";

import { useEffect, useState } from "react";
import { PartyPopper, RotateCcw } from "lucide-react";
import { Confetti } from "./Confetti";
import { computeStats, useTwinStore } from "@/lib/twinkit/store";
import { formatMinutes } from "@/lib/twinkit/format";
import { downloadJson } from "@/lib/twinkit/scripts";
import { playFanfare, unlockAudio } from "@/lib/twinkit/sounds";

export function Complete() {
  const store = useTwinStore();
  const stats = computeStats(store);
  const yeet = useTwinStore((s) => s.yeet);
  const resetAll = useTwinStore((s) => s.resetAll);
  const setStep = useTwinStore((s) => s.setStep);
  const exportProgress = useTwinStore((s) => s.exportProgress);
  const markExported = useTwinStore((s) => s.markExported);
  const soundOn = useTwinStore((s) => s.soundOn);
  const startedAt = useTwinStore((s) => s.startedAt);
  const completedAt = useTwinStore((s) => s.completedAt);
  const [showConfetti, setShowConfetti] = useState(true);
  const [yeeting, setYeeting] = useState(false);

  useEffect(() => {
    void unlockAudio();
    if (soundOn) playFanfare();
    const t = window.setTimeout(() => setShowConfetti(false), 4000);
    return () => window.clearTimeout(t);
  }, [soundOn]);

  const elapsedMin =
    startedAt && completedAt
      ? Math.max(1, Math.round((completedAt - startedAt) / 60000))
      : null;

  return (
    <div className="relative mx-auto flex min-h-[70dvh] w-full max-w-md flex-col items-center justify-center px-4 pb-16 pt-24 text-center">
      <Confetti active={showConfetti} />

      <div
        className={`w-full space-y-5 rounded-2xl border border-border bg-bg-elevated p-6 sm:p-8 ${
          yeeting ? "yeet-out" : ""
        }`}
      >
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-success/40 bg-success-dim/40 text-success">
          <PartyPopper className="size-6" />
        </span>
        <div className="space-y-2">
          <h2 className="font-display text-2xl font-semibold text-fg sm:text-3xl">
            You’re set
          </h2>
          <p className="text-sm leading-relaxed text-fg-muted">
            {stats.checkedItems} steps done
            {stats.skippedItems ? ` · ${stats.skippedItems} skipped on purpose` : ""}
            {elapsedMin != null ? ` · about ${formatMinutes(elapsedMin)}` : ""}.
            Optional: save progress into the pack folder for next time.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="rounded-xl border border-border bg-bg-subtle py-3 text-sm font-medium text-fg hover:bg-bg-hover"
            onClick={() => {
              downloadJson("progress.json", exportProgress());
              markExported();
            }}
          >
            Save final progress
          </button>
          <button
            type="button"
            className="rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg"
            onClick={() => {
              setYeeting(true);
              window.setTimeout(() => yeet(), 650);
            }}
          >
            Close TwinKit
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 py-2 text-xs text-fg-subtle hover:text-fg-muted"
            onClick={() => {
              resetAll();
              setStep("welcome");
            }}
          >
            <RotateCcw className="size-3" />
            Start a new run
          </button>
        </div>
      </div>
    </div>
  );
}
