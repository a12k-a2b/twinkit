"use client";

import { useState } from "react";
import { ArrowRight, HardDrive, Laptop } from "lucide-react";
import { SIMPLE_PRESETS } from "@/lib/twinkit/presets";
import { TWINKIT_VERSION } from "@/lib/twinkit/types";
import {
  getNextOpenItem,
  useTwinStore,
} from "@/lib/twinkit/store";
import { playClick, unlockAudio } from "@/lib/twinkit/sounds";
import type { ProfilePreset, SessionBudgetMin } from "@/lib/twinkit/types";

export function Welcome() {
  const startSimple = useTwinStore((s) => s.startSimple);
  const resumeMission = useTwinStore((s) => s.resumeMission);
  const startSession = useTwinStore((s) => s.startSession);
  const unyeet = useTwinStore((s) => s.unyeet);
  const soundOn = useTwinStore((s) => s.soundOn);
  const yeeted = useTwinStore((s) => s.yeeted);
  const paused = useTwinStore((s) => s.paused);
  const startedAt = useTwinStore((s) => s.startedAt);
  const completedAt = useTwinStore((s) => s.completedAt);
  const lastDoneTitle = useTwinStore((s) => s.lastDoneTitle);
  const state = useTwinStore();
  const next = getNextOpenItem(state);

  const [phase, setPhase] = useState<"pick-mac" | "pick-desk" | "pick-budget">(
    "pick-mac",
  );
  const [mac, setMac] = useState<"pack" | "unpack" | null>(null);
  const [desk, setDesk] = useState<ProfilePreset>(SIMPLE_PRESETS[0]!);

  const click = () => {
    void unlockAudio();
    if (soundOn) playClick();
  };

  const canResume = !!startedAt && !completedAt && !yeeted;

  const go = (budget: SessionBudgetMin, bodyDouble = false) => {
    click();
    if (yeeted) unyeet();
    if (!mac) return;
    startSimple(mac, desk, budget, bodyDouble);
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-4 pb-16 pt-10 sm:pt-14">
      <header className="space-y-3 text-center sm:text-left">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-success">
          TwinKit
        </p>
        <h1 className="font-display text-balance text-3xl font-semibold tracking-tight text-fg">
          Copy your coding setup to another Mac
        </h1>
        <p className="text-base leading-relaxed text-fg-muted">
          One step at a time. Pick a sprint length. Sign-ins stay human.
        </p>
      </header>

      {canResume && (
        <div className="rounded-2xl border border-success/35 bg-success-dim/20 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-success">
            {paused ? "Paused" : "Pick up here"}
          </p>
          {lastDoneTitle && (
            <p className="mt-1 text-xs text-fg-subtle">Last done: {lastDoneTitle}</p>
          )}
          <p className="mt-1 text-base font-semibold text-fg">
            Next: {next?.item.title ?? "Lane is clear"}
          </p>
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg"
            onClick={() => {
              click();
              startSession(state.sessionBudgetMin || 15, state.bodyDouble);
            }}
          >
            Do the next thing
            <ArrowRight className="size-4" />
          </button>
          <button
            type="button"
            className="mt-2 w-full text-center text-xs text-fg-subtle hover:text-fg-muted"
            onClick={() => {
              click();
              resumeMission();
            }}
          >
            Resume without a new timer
          </button>
        </div>
      )}

      {phase === "pick-mac" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-fg">Which Mac are you on right now?</p>
          <button
            type="button"
            className="flex w-full items-start gap-4 rounded-2xl border border-border bg-bg-elevated p-4 text-left hover:bg-bg-hover"
            onClick={() => {
              click();
              setMac("pack");
              setPhase("pick-desk");
            }}
          >
            <Laptop className="mt-0.5 size-5 text-fg-muted" />
            <span>
              <span className="block font-semibold text-fg">The one that already works</span>
              <span className="mt-1 block text-sm text-fg-muted">Pack. About a 15–60 min sprint.</span>
            </span>
          </button>
          <button
            type="button"
            className="flex w-full items-start gap-4 rounded-2xl border border-success/40 bg-success-dim/20 p-4 text-left hover:border-success/60"
            onClick={() => {
              click();
              setMac("unpack");
              setPhase("pick-desk");
            }}
          >
            <HardDrive className="mt-0.5 size-5 text-success" />
            <span>
              <span className="block font-semibold text-fg">The new Mac at home</span>
              <span className="mt-1 block text-sm text-fg-muted">
                Unpack in sprints. Walk away whenever.
              </span>
            </span>
          </button>
        </div>
      )}

      {phase === "pick-desk" && mac && (
        <div className="space-y-4">
          <button
            type="button"
            className="text-sm text-fg-muted hover:text-fg"
            onClick={() => setPhase("pick-mac")}
          >
            ← Change Mac
          </button>
          <p className="text-sm font-medium text-fg">What’s on your desk?</p>
          {SIMPLE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                click();
                setDesk(p);
              }}
              className={`w-full rounded-2xl border px-4 py-3.5 text-left ${
                desk.id === p.id
                  ? "border-success/45 bg-success-dim/25"
                  : "border-border bg-bg-elevated hover:bg-bg-hover"
              }`}
            >
              <span className="block text-sm font-semibold text-fg">
                {p.simpleLabel ?? p.label}
              </span>
              <span className="mt-0.5 block text-sm text-fg-muted">{p.description}</span>
            </button>
          ))}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-semibold text-accent-fg"
            onClick={() => {
              click();
              setPhase("pick-budget");
            }}
          >
            Next — how long do you have?
            <ArrowRight className="size-4" />
          </button>
        </div>
      )}

      {phase === "pick-budget" && mac && (
        <div className="space-y-4">
          <button
            type="button"
            className="text-sm text-fg-muted hover:text-fg"
            onClick={() => setPhase("pick-desk")}
          >
            ← Desk
          </button>
          <p className="text-sm font-medium text-fg">
            How long is this sprint? (You can stop early.)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([15, 30, 60] as SessionBudgetMin[]).map((n) => (
              <button
                key={n}
                type="button"
                className="rounded-2xl border border-border bg-bg-elevated py-4 text-lg font-semibold text-fg hover:border-success/40 hover:bg-success-dim/20"
                onClick={() => go(n, false)}
              >
                {n}
                <span className="mt-0.5 block text-xs font-normal text-fg-muted">min</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="w-full rounded-2xl border border-success/35 bg-success-dim/15 py-4 text-sm font-semibold text-fg hover:border-success/50"
            onClick={() => go(25, true)}
          >
            25 min body double
            <span className="mt-1 block text-xs font-normal text-fg-muted">
              Timer on screen. One step. No mountain.
            </span>
          </button>
        </div>
      )}

      <p className="text-center font-mono text-[10px] text-fg-subtle">
        v{TWINKIT_VERSION} · sprint mode
      </p>
    </div>
  );
}
