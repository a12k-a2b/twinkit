"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import {
  computeStats,
  getNextOpenItem,
  isDirty,
  useTwinStore,
} from "@/lib/twinkit/store";
import { unlockAudio } from "@/lib/twinkit/sounds";
import { downloadJson } from "@/lib/twinkit/scripts";

export function MenuBarHUD() {
  const step = useTwinStore((s) => s.step);
  const yeeted = useTwinStore((s) => s.yeeted);
  const soundOn = useTwinStore((s) => s.soundOn);
  const toggleSound = useTwinStore((s) => s.toggleSound);
  const yeet = useTwinStore((s) => s.yeet);
  const paused = useTwinStore((s) => s.paused);
  const pauseMission = useTwinStore((s) => s.pauseMission);
  const resumeMission = useTwinStore((s) => s.resumeMission);
  const exportProgress = useTwinStore((s) => s.exportProgress);
  const markExported = useTwinStore((s) => s.markExported);
  const state = useTwinStore();
  const stats = computeStats(state);
  const next = getNextOpenItem(state);
  const [now, setNow] = useState(Date.now());
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (yeeted) setLeaving(true);
  }, [yeeted]);

  if (step === "welcome" || step === "modules") return null;
  if (leaving && yeeted) return null;

  const budgetMs =
    (state.sessionBudgetMin + state.sessionExtraMin) * 60 * 1000;
  const remain = state.sessionStartedAt
    ? Math.max(0, budgetMs - (now - state.sessionStartedAt))
    : budgetMs;
  const rs = Math.floor(remain / 1000);
  const clock = `${Math.floor(rs / 60)}:${String(rs % 60).padStart(2, "0")}`;
  const dirty = isDirty(state);

  return (
    <div
      className={`fixed inset-x-0 top-[calc(var(--grok-banner-h,0px)+0.5rem)] z-40 flex justify-center px-3 ${
        leaving ? "yeet-out pointer-events-none" : ""
      }`}
      role="status"
    >
      <div className="flex w-full max-w-lg items-center gap-3 rounded-2xl border border-border/80 bg-bg-elevated/95 px-3 py-2 shadow-panel backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold tabular text-success">
              {clock}
            </span>
            <p className="truncate text-sm text-fg">
              {step === "session-win"
                ? "Sprint done"
                : paused
                  ? "Paused"
                  : next
                    ? next.item.title
                    : stats.twinReady
                      ? "All done"
                      : "Lane clear"}
            </p>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-progress-track">
            <div
              className="h-full bg-progress"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
          <p className="mt-0.5 truncate text-[10px] text-fg-muted">
            {stats.pct}% checked
            {dirty ? " · unsaved" : ""}
          </p>
        </div>
        <div className="flex shrink-0">
          {dirty && (
            <button
              type="button"
              className="rounded-lg px-2 py-2 text-[11px] font-medium text-warn hover:bg-bg-hover"
              onClick={() => {
                downloadJson("progress.json", exportProgress());
                markExported();
              }}
            >
              Save
            </button>
          )}
          <button
            type="button"
            className="rounded-lg p-2 text-fg-muted hover:bg-bg-hover hover:text-fg"
            aria-label={paused ? "Resume" : "Pause"}
            onClick={() => (paused ? resumeMission() : pauseMission())}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-fg-muted hover:bg-bg-hover hover:text-fg"
            aria-label="Sound"
            onClick={() => {
              void unlockAudio();
              toggleSound();
            }}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          {stats.twinReady && (
            <button
              type="button"
              className="rounded-lg p-2 text-fg-muted hover:text-danger"
              aria-label="Close"
              onClick={() => {
                setLeaving(true);
                window.setTimeout(() => yeet(), 600);
              }}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
