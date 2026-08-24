"use client";

import { ArrowLeft, Download, MonitorSmartphone } from "lucide-react";
import { RAYCAST_SCRIPT, downloadText } from "@/lib/twinkit/scripts";
import { useTwinStore } from "@/lib/twinkit/store";
import { playClick, unlockAudio } from "@/lib/twinkit/sounds";

/**
 * Honest always-on companion guidance — not a fake native menu bar app.
 */
export function Companion() {
  const setStep = useTwinStore((s) => s.setStep);
  const startedAt = useTwinStore((s) => s.startedAt);
  const soundOn = useTwinStore((s) => s.soundOn);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:pt-10">
      <button
        type="button"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
        onClick={() => setStep(startedAt ? "mission" : "welcome")}
      >
        <ArrowLeft className="size-3.5" />
        Back
      </button>

      <header className="mb-8 space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-fg-subtle">
          Companion
        </p>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">
          Always-on progress (honest version)
        </h2>
        <p className="text-sm leading-relaxed text-fg-muted">
          TwinKit is a web app. The floating HUD only exists while this tab is
          open — it is <span className="text-fg">not</span> a native macOS menu
          bar process. Use one of these real options when you disappear into
          System Settings.
        </p>
      </header>

      <div className="space-y-3">
        <div className="panel space-y-2 p-4">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="size-4 text-success" />
            <h3 className="text-sm font-semibold text-fg">Dedicated browser window</h3>
          </div>
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-fg-muted">
            <li>Open TwinKit in its own window (not a buried tab).</li>
            <li>On Mac: Window → tile left, System Settings on the right.</li>
            <li>Keep the HUD expanded for section list + remaining time.</li>
          </ol>
        </div>

        <div className="panel space-y-2 p-4">
          <h3 className="text-sm font-semibold text-fg">Dock / Home Screen</h3>
          <p className="text-sm text-fg-muted">
            After you publish TwinKit, use the platform install flow (Add to Dock
            / Home Screen) so it launches like an app. Still not a menu bar
            extra — but one click away.
          </p>
        </div>

        <div className="panel space-y-3 p-4">
          <h3 className="text-sm font-semibold text-fg">Raycast script command</h3>
          <p className="text-sm text-fg-muted">
            One hotkey to reopen TwinKit. Set <span className="font-mono">TWINKIT_URL</span>{" "}
            to your published URL (or the preview URL you use).
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-fg"
            onClick={() => {
              void unlockAudio();
              if (soundOn) playClick();
              downloadText("twin-kit-raycast.sh", RAYCAST_SCRIPT);
            }}
          >
            <Download className="size-3.5" />
            Download Raycast script
          </button>
        </div>

        <div className="panel space-y-2 p-4">
          <h3 className="text-sm font-semibold text-fg">Shortcuts.app (one-liner)</h3>
          <p className="text-sm text-fg-muted">
            New Shortcut → Open URLs → paste your TwinKit URL → add to Menu Bar
            or Dock. That is the closest free "menu bar checklist"
            without shipping a native binary.
          </p>
        </div>

        <div className="panel space-y-2 border-warn/30 p-4">
          <h3 className="text-sm font-semibold text-fg">What we did not ship</h3>
          <p className="text-sm text-fg-muted">
            A signed Swift/Tauri menu bar agent. That would survive any window
            and could deep-link System Settings panes — track it as a future
            native companion if TwinKit becomes a daily habit.
          </p>
        </div>
      </div>
    </div>
  );
}
