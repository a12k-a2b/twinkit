"use client";

import { useTwinStore } from "@/lib/twinkit/store";
import { parityTone } from "@/lib/twinkit/parity";
import type { ParityStatus } from "@/lib/twinkit/types";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

export function ParityDashboard() {
  const parity = useTwinStore((s) => s.parity);
  const manifest = useTwinStore((s) => s.manifest);
  if (!parity && !manifest) return null;

  return (
    <div className="space-y-4">
      {parity && (
        <div className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-fg">Parity report</h3>
              <p className="text-xs text-fg-muted">
                From twin-verify · {parity.source}
                {parity.generatedAt ? ` · ${parity.generatedAt}` : ""}
              </p>
            </div>
            <div className="flex gap-2 font-mono text-[11px]">
              <Badge tone="success">{parity.pass} pass</Badge>
              <Badge tone="warn">{parity.warn} warn</Badge>
              <Badge tone="danger">{parity.fail} fail</Badge>
            </div>
          </div>
          {parity.fail > 0 ? (
            <p className="text-xs text-danger">
              Gaps remain — install missing tools or accept intentional skips after triage.
            </p>
          ) : (
            <p className="text-xs text-success">No fails — good enough to smoke-test agents.</p>
          )}
          {parity.results.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {parity.results.map((r, i) => (
                <li
                  key={`${r.name}-${i}`}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0">
                    <StatusDot status={r.status} />
                    <span className="ml-1.5 font-mono text-fg">{r.name}</span>
                    <span className="mt-0.5 block truncate text-fg-muted">{r.detail}</span>
                  </span>
                  <span className="shrink-0 font-mono uppercase text-fg-subtle">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {manifest && (
        <div className="panel space-y-3 p-4">
          <div>
            <h3 className="text-sm font-semibold text-fg">MANIFEST install hints</h3>
            <p className="text-xs text-fg-muted">
              {[manifest.host, manifest.arch, manifest.macos].filter(Boolean).join(" · ") ||
                "Imported MANIFEST.md"}
              {manifest.packedAt ? ` · packed ${manifest.packedAt}` : ""}
            </p>
          </div>
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {manifest.tools.map((t) => (
              <li
                key={t.name}
                className="rounded-lg border border-border bg-bg px-2.5 py-2 text-xs"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono font-medium text-fg">{t.name}</span>
                  <span
                    className={
                      t.presentOnPack ? "text-fg-muted" : "text-fg-subtle line-through"
                    }
                  >
                    {t.versionLine}
                  </span>
                </div>
                {t.presentOnPack && t.installHint && (
                  <InstallLine command={t.installHint} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InstallLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1.5 flex items-stretch gap-1 overflow-hidden rounded-md border border-border">
      <code className="min-w-0 flex-1 break-all px-2 py-1.5 font-mono text-[10px] text-fg-muted">
        {command}
      </code>
      <button
        type="button"
        className="shrink-0 border-l border-border px-2 text-fg-muted hover:bg-bg-hover hover:text-fg"
        aria-label="Copy install hint"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: ParityStatus }) {
  const tone = parityTone(status);
  const cls =
    tone === "success"
      ? "bg-success"
      : tone === "warn"
        ? "bg-warn"
        : tone === "danger"
          ? "bg-danger"
          : "bg-fg-subtle";
  return (
    <span className={`inline-block size-1.5 rounded-full align-middle ${cls}`} />
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "warn" | "danger";
}) {
  const cls =
    tone === "success"
      ? "border-success/40 text-success"
      : tone === "warn"
        ? "border-warn/40 text-warn"
        : "border-danger/40 text-danger";
  return (
    <span className={`rounded-full border px-2 py-0.5 tabular ${cls}`}>{children}</span>
  );
}
