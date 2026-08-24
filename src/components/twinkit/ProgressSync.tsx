"use client";

import { useRef, useState } from "react";
import { Check, Download, Upload } from "lucide-react";
import { modulesFromInventory, parseProgressJsonText } from "@/lib/twinkit/progress-io";
import {
  parseManifestMarkdown,
  parseParityJson,
  parseParityMarkdown,
} from "@/lib/twinkit/parity";
import { downloadJson } from "@/lib/twinkit/scripts";
import { useTwinStore } from "@/lib/twinkit/store";
import { playClick, unlockAudio } from "@/lib/twinkit/sounds";
import { ParityDashboard } from "./ParityDashboard";

export function ProgressSync({ compact }: { compact?: boolean }) {
  const exportProgress = useTwinStore((s) => s.exportProgress);
  const markExported = useTwinStore((s) => s.markExported);
  const importProgress = useTwinStore((s) => s.importProgress);
  const applyDiscover = useTwinStore((s) => s.applyDiscover);
  const setParity = useTwinStore((s) => s.setParity);
  const setManifest = useTwinStore((s) => s.setManifest);
  const packLabel = useTwinStore((s) => s.packLabel);
  const discoverNotes = useTwinStore((s) => s.discoverNotes);
  const simpleUi = useTwinStore((s) => s.simpleUi);
  const soundOn = useTwinStore((s) => s.soundOn);
  const progressInput = useRef<HTMLInputElement>(null);
  const inventoryInput = useRef<HTMLInputElement>(null);
  const parityInput = useRef<HTMLInputElement>(null);
  const manifestInput = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  const flash = (ok: string) => {
    setErr(null);
    setMsg(ok);
    window.setTimeout(() => setMsg(null), 2800);
  };

  const click = () => {
    void unlockAudio();
    if (soundOn) playClick();
  };

  const simple = simpleUi && compact && !showMore;

  return (
    <div className="space-y-3">
      <div
        className={
          compact
            ? "rounded-2xl border border-border bg-bg-elevated/80 p-3"
            : "panel space-y-3 p-4"
        }
      >
        {!compact && (
          <div>
            <h3 className="text-sm font-semibold text-fg">Save & load</h3>
            <p className="mt-1 text-sm text-fg-muted">
              Browser storage dies. Save a file into the pack folder.
            </p>
            {packLabel && (
              <p className="mt-1 text-xs text-fg-subtle">Pack: {packLabel}</p>
            )}
            {discoverNotes && (
              <p className="mt-1 text-xs text-success">{discoverNotes}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              click();
              downloadJson("progress.json", exportProgress());
              markExported();
              flash("Saved — put this in the pack folder");
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-semibold text-accent-fg"
          >
            <Download className="size-3.5" />
            Save progress
          </button>
          <button
            type="button"
            onClick={() => progressInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg-subtle px-3.5 py-2.5 text-sm font-medium text-fg hover:bg-bg-hover"
          >
            <Upload className="size-3.5" />
            Load progress
          </button>
          {!simple && (
            <>
              <button
                type="button"
                onClick={() => inventoryInput.current?.click()}
                className="rounded-xl border border-border px-3 py-2 text-xs text-fg-muted hover:bg-bg-hover"
              >
                Load inventory
              </button>
              <button
                type="button"
                onClick={() => manifestInput.current?.click()}
                className="rounded-xl border border-border px-3 py-2 text-xs text-fg-muted hover:bg-bg-hover"
              >
                Load MANIFEST
              </button>
              <button
                type="button"
                onClick={() => parityInput.current?.click()}
                className="rounded-xl border border-border px-3 py-2 text-xs text-fg-muted hover:bg-bg-hover"
              >
                Load verify
              </button>
            </>
          )}
        </div>

        {simple && (
          <button
            type="button"
            className="text-xs text-fg-subtle hover:text-fg-muted"
            onClick={() => setShowMore(true)}
          >
            More files…
          </button>
        )}

        <input
          ref={progressInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              importProgress(parseProgressJsonText(await f.text()));
              click();
              flash("Progress loaded");
            } catch (ex) {
              setMsg(null);
              setErr(ex instanceof Error ? ex.message : "Could not load file");
            }
          }}
        />
        <input
          ref={inventoryInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const { modules, notes } = modulesFromInventory(JSON.parse(await f.text()));
              applyDiscover(modules, notes);
              click();
              flash("Modules updated");
            } catch (ex) {
              setMsg(null);
              setErr(ex instanceof Error ? ex.message : "Bad inventory");
            }
          }}
        />
        <input
          ref={manifestInput}
          type="file"
          accept=".md,text/markdown,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const summary = parseManifestMarkdown(await f.text());
              if (summary.tools.length === 0) throw new Error("No tools in MANIFEST");
              setManifest(summary);
              click();
              flash(`MANIFEST: ${summary.tools.length} tools`);
            } catch (ex) {
              setMsg(null);
              setErr(ex instanceof Error ? ex.message : "MANIFEST failed");
            }
          }}
        />
        <input
          ref={parityInput}
          type="file"
          accept="application/json,.json,.md,text/markdown,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const text = await f.text();
              const report = f.name.endsWith(".md")
                ? parseParityMarkdown(text)
                : parseParityJson(JSON.parse(text) as unknown);
              setParity(report);
              click();
              flash(report.fail ? `${report.fail} still missing` : "Verify looks good");
            } catch (ex) {
              setMsg(null);
              setErr(ex instanceof Error ? ex.message : "Verify failed");
            }
          }}
        />

        {msg && (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <Check className="size-3.5" />
            {msg}
          </p>
        )}
        {err && <p className="text-xs text-danger">{err}</p>}
      </div>

      {!simple && <ParityDashboard />}
    </div>
  );
}
