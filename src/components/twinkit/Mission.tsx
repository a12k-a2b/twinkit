"use client";

import { SprintScreen } from "./SprintScreen";
import { computeStats, useTwinStore } from "@/lib/twinkit/store";
import { formatMinutes } from "@/lib/twinkit/format";
import { Check, ChevronRight, Minus } from "lucide-react";
import { useState } from "react";

/** Sprint is the product. Mountain is opt-in. */
export function Mission() {
  const showMountain = useTwinStore((s) => s.showMountain);
  const toggleMountain = useTwinStore((s) => s.toggleMountain);

  return (
    <div>
      <SprintScreen />
      {showMountain && (
        <div className="mx-auto max-w-lg px-4 pb-24">
          <button
            type="button"
            className="mb-3 text-xs text-fg-subtle hover:text-fg-muted"
            onClick={() => toggleMountain()}
          >
            Hide the mountain
          </button>
          <Mountain />
        </div>
      )}
    </div>
  );
}

function Mountain() {
  const state = useTwinStore();
  const stats = computeStats(state);
  const checked = useTwinStore((s) => s.checked);
  const skipped = useTwinStore((s) => s.skipped);
  const toggleItem = useTwinStore((s) => s.toggleItem);
  const doesntApply = useTwinStore((s) => s.doesntApply);

  return (
    <div className="space-y-2">
      {stats.sections.map((s, idx) => {
        const st = stats.sectionStats.find((x) => x.id === s.id)!;
        return (
          <details
            key={s.id}
            className="rounded-xl border border-border bg-bg-elevated"
            open={!st.resolved}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm">
              <ChevronRight className="size-3.5 text-fg-subtle" />
              <span className="flex-1 font-medium text-fg">{s.title}</span>
              <span className="font-mono text-[11px] text-fg-subtle">
                {st.checked}/{st.total}
                {!st.resolved ? ` · ${formatMinutes(st.remaining)}` : ""}
              </span>
            </summary>
            <ul className="border-t border-border px-2 py-2">
              {s.items.map((it) => {
                const on = !!checked[it.id];
                const sk = !!skipped[it.id];
                return (
                  <li key={it.id} className="flex items-start gap-2 px-2 py-2 text-sm">
                    <button
                      type="button"
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border ${
                        on
                          ? "border-success bg-success text-accent-fg"
                          : sk
                            ? "border-border bg-bg-hover"
                            : "border-border-strong"
                      }`}
                      onClick={() => toggleItem(it.id, s.id, it.title)}
                    >
                      {on ? (
                        <Check className="size-3" />
                      ) : sk ? (
                        <Minus className="size-3 text-fg-subtle" />
                      ) : null}
                    </button>
                    <span className={on ? "text-fg-muted line-through" : "text-fg"}>
                      {it.title}
                    </span>
                    {!on && !sk && (
                      <button
                        type="button"
                        className="ml-auto shrink-0 text-[11px] text-fg-subtle hover:text-fg"
                        onClick={() => doesntApply(it.id, s.id)}
                      >
                        n/a
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
