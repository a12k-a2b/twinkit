"use client";

import { useState } from "react";
import { ArrowLeft, Check, Download, Terminal } from "lucide-react";
import {
  RAYCAST_SCRIPT,
  TWIN_DISCOVER_SH,
  TWIN_PACK_SH,
  TWIN_UNPACK_SH,
  TWIN_VERIFY_SH,
  TWINKIT_PROMPT_MD,
  TWINKIT_SKILL_MD,
  TWINKIT_SH_VERSION,
  downloadText,
} from "@/lib/twinkit/scripts";
import { useTwinStore } from "@/lib/twinkit/store";
import { playClick, unlockAudio } from "@/lib/twinkit/sounds";
import { ProgressSync } from "./ProgressSync";

const PRIMARY = [
  {
    id: "discover",
    title: "1. Discover",
    file: "twin-discover.sh",
    body: "Scan the Mac you’re on. Run first on the old machine.",
    content: TWIN_DISCOVER_SH,
  },
  {
    id: "pack",
    title: "2. Pack",
    file: "twin-pack.sh",
    body: "Copy configs into a pack folder. Stops if it finds secrets.",
    content: TWIN_PACK_SH,
  },
  {
    id: "unpack",
    title: "3. Unpack",
    file: "twin-unpack.sh",
    body: "Apply the pack on the new Mac. Try --dry-run first.",
    content: TWIN_UNPACK_SH,
  },
  {
    id: "verify",
    title: "4. Verify",
    file: "twin-verify.sh",
    body: "Compare tools to the pack. Load the results on the checklist.",
    content: TWIN_VERIFY_SH,
  },
] as const;

export function Toolkit() {
  const setStep = useTwinStore((s) => s.setStep);
  const soundOn = useTwinStore((s) => s.soundOn);
  const startedAt = useTwinStore((s) => s.startedAt);
  const mode = useTwinStore((s) => s.mode);
  const [copied, setCopied] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const dl = (name: string, content: string) => {
    void unlockAudio();
    if (soundOn) playClick();
    downloadText(name, content);
  };

  const copy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  };

  const highlight =
    mode === "pack"
      ? ["discover", "pack"]
      : mode === "unpack"
        ? ["unpack", "verify"]
        : ["discover", "pack", "unpack", "verify"];

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-6 sm:pt-10">
      <button
        type="button"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
        onClick={() => setStep(startedAt ? "mission" : "welcome")}
      >
        <ArrowLeft className="size-3.5" />
        Back to checklist
      </button>

      <header className="mb-6 space-y-2">
        <h2 className="font-display text-2xl font-semibold text-fg">Scripts</h2>
        <p className="text-sm text-fg-muted">
          Download → run in Terminal → tick the matching checklist step. That’s
          the whole game.
        </p>
      </header>

      <div className="mb-6">
        <ProgressSync />
      </div>

      <div className="space-y-2">
        {PRIMARY.map((s) => {
          const hot = highlight.includes(s.id);
          return (
            <div
              key={s.id}
              className={`rounded-2xl border p-4 ${
                hot
                  ? "border-success/35 bg-success-dim/15"
                  : "border-border bg-bg-elevated opacity-80"
              }`}
            >
              <div className="flex items-start gap-3">
                <Terminal className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{s.title}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">{s.body}</p>
                  <p className="mt-1 font-mono text-[11px] text-fg-subtle">
                    bash ~/Downloads/{s.file}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => dl(s.file, s.content)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg"
                    >
                      <Download className="size-3.5" />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(s.id, s.content)}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-fg-muted hover:bg-bg-hover hover:text-fg"
                    >
                      {copied === s.id ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <Check className="size-3.5" />
                          Copied
                        </span>
                      ) : (
                        "Copy"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="mt-4 text-xs text-fg-subtle hover:text-fg-muted"
        onClick={() => setMore((m) => !m)}
      >
        {more ? "Hide extras" : "Claude skill, prompt, Raycast…"}
      </button>

      {more && (
        <div className="mt-3 space-y-2">
          <Extra
            title="Claude skill"
            onDl={() => dl("SKILL.md", TWINKIT_SKILL_MD)}
            onCopy={() => copy("skill", TWINKIT_SKILL_MD)}
            copied={copied === "skill"}
          />
          <Extra
            title="One-shot prompt"
            onDl={() => dl("twinkit-prompt.md", TWINKIT_PROMPT_MD)}
            onCopy={() => copy("prompt", TWINKIT_PROMPT_MD)}
            copied={copied === "prompt"}
          />
          <Extra
            title="Raycast reopen script"
            onDl={() => dl("twin-kit-raycast.sh", RAYCAST_SCRIPT)}
            onCopy={() => copy("raycast", RAYCAST_SCRIPT)}
            copied={copied === "raycast"}
          />
          <p className="px-1 text-xs text-fg-subtle">
            Scripts refuse to pack secrets unless you force it. Prefer an
            encrypted disk for the pack folder. v{TWINKIT_SH_VERSION}
          </p>
        </div>
      )}
    </div>
  );
}

function Extra({
  title,
  onDl,
  onCopy,
  copied,
}: {
  title: string;
  onDl: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
      <span className="text-sm text-fg">{title}</span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onDl}
          className="text-xs font-medium text-fg-muted hover:text-fg"
        >
          Download
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="text-xs font-medium text-fg-muted hover:text-fg"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
    </div>
  );
}
