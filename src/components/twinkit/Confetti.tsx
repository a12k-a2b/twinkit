"use client";

import { useMemo } from "react";

const COLORS = ["#5eead4", "#f4f4f5", "#94a3b8", "#a1a1aa", "#2dd4bf"];

export function Confetti({ active }: { active: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        left: `${(i * 17 + 7) % 100}%`,
        delay: `${(i % 12) * 0.05}s`,
        duration: `${2.2 + (i % 5) * 0.25}s`,
        color: COLORS[i % COLORS.length]!,
        dx: `${((i * 13) % 80) - 40}px`,
        w: 4 + (i % 5),
        h: 8 + (i % 7),
      })),
    [],
  );

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-hidden
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={
            {
              left: p.left,
              width: p.w,
              height: p.h,
              background: p.color,
              animation: `confetti-fall ${p.duration} cubic-bezier(0.22, 1, 0.36, 1) ${p.delay} both`,
              ["--dx" as string]: p.dx,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
