"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { MODULES } from "@/lib/twinkit/modules";
import { EXTRA_PRESETS, SIMPLE_PRESETS } from "@/lib/twinkit/presets";
import { computeStats, useTwinStore } from "@/lib/twinkit/store";
import { formatMinutes } from "@/lib/twinkit/format";
import { playClick, unlockAudio } from "@/lib/twinkit/sounds";

/** Advanced setup — optional. Happy path skips this. */
export function ModulePicker() {
  const enabled = useTwinStore((s) => s.enabledModules);
  const toggleModule = useTwinStore((s) => s.toggleModule);
  const setStep = useTwinStore((s) => s.setStep);
  const startMission = useTwinStore((s) => s.startMission);
  const applyPreset = useTwinStore((s) => s.applyPreset);
  const mode = useTwinStore((s) => s.mode);
  const setMode = useTwinStore((s) => s.setMode);
  const soundOn = useTwinStore((s) => s.soundOn);
  const profileId = useTwinStore((s) => s.profileId);
  const state = useTwinStore();
  const stats = computeStats(state);
  const [fineTune, setFineTune] = useState(false);

  const click = () => {
    void unlockAudio();
    if (soundOn) playClick();
  };

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-6">
      <button
        type="button"
        className="mb-6 text-sm text-fg-muted hover:text-fg"
        onClick={() => setStep("welcome")}
      >
        <span className="inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" />
          Back
        </span>
      </button>

      <header className="mb-6 space-y-2">
        <h2 className="font-display text-2xl font-semibold text-fg">
          Advanced setup
        </h2>
        <p className="text-sm text-fg-muted">
          Optional. Most people only need the three desk types on the welcome
          screen.
        </p>
        <p className="text-sm text-success">
          ~{formatMinutes(stats.totalMin)} · {stats.totalItems} steps
        </p>
      </header>

      <div className="mb-4 flex gap-2">
        {(
          [
            ["unpack", "New Mac"],
            ["pack", "Old Mac"],
            ["both", "Both"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              click();
              setMode(id);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              mode === id
                ? "bg-accent text-accent-fg"
                : "border border-border text-fg-muted hover:bg-bg-hover"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 space-y-2">
        {[...SIMPLE_PRESETS, ...EXTRA_PRESETS].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              click();
              applyPreset(p);
            }}
            className={`w-full rounded-xl border px-3 py-2.5 text-left ${
              profileId === p.id
                ? "border-success/40 bg-success-dim/25"
                : "border-border bg-bg-elevated hover:bg-bg-hover"
            }`}
          >
            <span className="text-sm font-medium text-fg">{p.label}</span>
            <span className="mt-0.5 block text-xs text-fg-muted">
              {p.description}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="mb-3 text-xs text-fg-subtle hover:text-fg-muted"
        onClick={() => setFineTune((v) => !v)}
      >
        {fineTune ? "Hide module toggles" : "Fine-tune individual modules"}
      </button>

      {fineTune && (
        <ul className="mb-6 space-y-1.5">
          {MODULES.map((m) => {
            const on = enabled.includes(m.id);
            const locked = m.id === "core";
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    click();
                    toggleModule(m.id);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                    on
                      ? "border-success/30 bg-success-dim/15"
                      : "border-border bg-bg-elevated"
                  }`}
                >
                  <span
                    className={`grid size-4 place-items-center rounded border ${
                      on
                        ? "border-success bg-success text-accent-fg"
                        : "border-border"
                    }`}
                  >
                    {on && <Check className="size-2.5" strokeWidth={3} />}
                  </span>
                  {m.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-fg"
        onClick={() => {
          click();
          startMission();
        }}
      >
        Open checklist
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}
